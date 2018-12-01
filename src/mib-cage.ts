import { Cage, CageGroup, GroupType, GroupRedundancy, GroupStatus, CageModule, ModuleType, ModuleStatus, ModuleStatusLED, LNAStatus, BiasTState, LaserStatus, MeasRfLevel, SetDefaults, RestoreFactory, EventLogItem, EventLevel, PowerSupply, PowerStatus, SnmpVarBind, TrapReciver, TrapLevelFilter, MonPlan, RfLinkTest, CAGE_VARBINDS, CAGEEVENTS_VARBINDS, CAGE_MODULE_VARBINDS, POWER_VARBINDS, TRAPRECEIVERS_VARBINDS, CAGETRAPRECEIVERS_TABLE, CAGEGROUP_TABLE, CAGEMODULE_TABLE, CAGEEVENTS_TABLE, CAGE_GROUP_VARBINDS } from 'rfof-common';
import { SNMP } from './snmp';
import { Cache } from './cache';
import { environment } from './environments/environment';
import { EventEmitter } from 'events';
import { SNMPListener } from './snmp-listener';
import { CAGE, CAGE_EVENTS, CAGE_GROUPS, CAGE_MODULES, CAGE_POWERSUPPLY, CAGE_TRAPRECIVERS } from 'rfof-common';
import { logger } from './logger';

export class MIBCage extends EventEmitter {
	private snmp;
	private snmpListener: SNMPListener;
	private sampleTimer;
	private updateTimer;
	private updateCacheTimer;
	cage: Cage = new Cage();
	power: PowerSupply[] = [];
	network: TrapReciver[] = [];
	cageGroups: CageGroup[] = [];
	cageModules: CageModule[] = [];
	cageEventlog: EventLogItem[] = [];

	constructor() {
		super();
		this.snmp = new SNMP();
		this.snmpListener = new SNMPListener();

		let self = this;
		this.snmpListener.messageEmitter.on('message', (message) => {
			let data = message.toString('ascii');
			let match = data.match(/(critical|warning|change|notify|system),\s*([\w\W]*)/i);

			if (match) {
				let logline = new EventLogItem();
				logline.time = new Date();
				logline.level = EventLevel[match[1].toLowerCase()];
				logline.detail = match[2];
				logger.debug('Recived logline %s from %s', logline.detail);

				this.interpretLogLine(logline);
				if (logline.module) {
					if (logline.value) {
						let varbind = CAGE_MODULE_VARBINDS.find(item => {
							let regExp = new RegExp(logline.property, 'i');
							return item.name.match(regExp);
						});
						if (varbind) {
							logline.module[varbind.name] = logline.value;
						}
					}
					self.sampleModuleSensors(logline.module).then(() => {
						self.emit('moduleupdate', logline.module);
					});
				}
				self.emit('eventlogline', logline);
			}
		});
	}

	public startDelayedSampler(module: CageModule) {
		let self = this;
		this.sampleTimer = setTimeout(function sample() {
			self.sampleModuleSensors(module);
		}, 1000);
	}

	public startRFTestSampler(module: CageModule) {
		let self = this;
		this.sampleTimer = setTimeout(function sample() {
			self.sampleModuleSensors(module).then(updatedModule => {
				self.emit('sensors', updatedModule);
				if (updatedModule.rfLinkTest == RfLinkTest.on) {
					if (self.sampleTimer) clearTimeout(self.sampleTimer);
					self.sampleTimer = setTimeout(sample, 500);
				}
			});
		}, 500);
	}

	public startMonplanTestSampler(module: CageModule) {
		let self = this;
		this.sampleTimer = setTimeout(function sample() {
			self.sampleModuleSensors(module).then(updatedModule => {
				if (updatedModule.monPlan == MonPlan.active) {
					if (self.sampleTimer) clearTimeout(self.sampleTimer);
					self.sampleTimer = setTimeout(sample, 500);
				}
			});
		}, 500);
	}

	public showRFLevelSampler(module: CageModule) {
		return this.sampleModuleSensors(module);
	}

	async sampleModuleSensors(module: CageModule) {
		let sensors = ['statusLED', 'optPower', 'rfLevel', 'rfLinkTest', 'rfTestTimer', 'measRfLevel', 'temp', 'monTimer'];
		let varBinds = CAGE_MODULE_VARBINDS.filter((varbind) => {
			return sensors.find((sensor) => {
				return varbind.name == sensor;
			}) != null;
		});
		varBinds.map(varbind => {
			varbind.index = module.index;
			return varbind;
		});
		let values = [];
		for (let varbind of varBinds) {
			let value = await this.snmp.get(varbind);
			values.push(value);
		}
		values.map(varbind => {
			let value = varbind.value;
			module[varbind.name] = value;
		});
		let idx = this.cageModules.findIndex((item) => {
			return item.slot == module.slot && item.name == module.name;
		});
		this.cageModules[idx] = module;

		this.emit('sensors', module);
		return module;
	}

	async setCageGroupParameter(group: CageGroup) {
		let cageGroup = this.cageGroups.find(item => {
			return item.index == item.index;
		});

		if (cageGroup.redundencySwitch != group.redundencySwitch) {
				let groupColumns = CAGE_GROUP_VARBINDS;
			let varBind = groupColumns.find(column => {
				return column.name == 'redundencySwitch';
			});
			varBind.value = group.redundencySwitch;
			varBind.index = group.index;
			varBind.oid += '.' + group.index;

			this.snmp = new SNMP();
			let varBinds: SnmpVarBind[] = [varBind];
			let result = await this.snmp.set(varBinds);
			this.snmp.close();

			cageGroup = group;
			return result;
		}
		return null;
	}

	async setModuleParameter(module: CageModule) {
		let index = this.cageModules.findIndex((item) => {
			return item.slot == module.slot;
		});
		let currentModule = this.cageModules[index];

		let fields = ['lna', 'atten', 'laser', 'measRfLevel', 'rfLinkTest', 'rfLinkTestTime', 'monPlan', 'monInterval'];

		let varBinds = CAGE_MODULE_VARBINDS.filter(varbind => {
			return fields.indexOf(varbind.name) > -1 && currentModule[varbind.name] != module[varbind.name];
		});
		varBinds.map((varbind) => {
			varbind.value = module[varbind.name];
			varbind.index = module.index;
			return varbind;
		});
		for (let varbind of varBinds) {
			await this.snmp.set(varbind);
			this.cageModules[index][varbind.name] = varbind.value;
		}

		if (module.rfLinkTest == RfLinkTest.on) {
			this.startRFTestSampler(module);
		}
		if (module.monPlan == MonPlan.active) {
			this.startMonplanTestSampler(module);
		}

		return varBinds;
	}

	async getData() {
		try {
			if (!environment.mock) {
				await this.getCageInfoAsync();
				await this.getCagePowerSupplyAsync();
				await this.getCageTrapReciversAsync();
				await this.getCageGroupsAsync();
				await this.getCageModulsAsync();
				await this.getCageEventsAsync();
			} else {
				this.cage = CAGE;
				this.power = CAGE_POWERSUPPLY;
				this.network = CAGE_TRAPRECIVERS;
				this.cageGroups = CAGE_GROUPS;
				this.cageModules = CAGE_MODULES;
				this.cageEventlog = CAGE_EVENTS;
			}
		} catch (err) {
			console.log(err);
		} finally {
			this.emit('flush', {
				cage: this.cage,
				power: this.power,
				network: this.network,
				groups: this.cageGroups,
				modules: this.cageModules,
				events: this.cageEventlog
			});
			let self = this;
			this.updateTimer = setTimeout(function sample() {
				self.getData().then(() => {
					if (self.updateTimer) clearTimeout(self.updateTimer);
					self.updateTimer = setTimeout(sample, 900000);
				});
			}, 900000);
		}
	}

	private async getCageInfoAsync() {
		let values = [];
		for (let item of CAGE_VARBINDS) {
			let varbind = await this.snmp.get(item);
			values.push(varbind);
		}
		values.map(varBind => {
			let value = varBind.value;
			let type = typeof this.cage[varBind.name];
			switch (type) {
				case 'number':
					value = Number(varBind.value);
					break;
			}
			this.cage[varBind.name] = varBind.value;
		});
		return this.cage;
	}

	private async getCagePowerSupplyAsync() {
		let values = [];
		for (let item of POWER_VARBINDS) {
			let varbind = await this.snmp.get(item);
			values.push(varbind);
		}
		if (values.length > 0) {
			let value = values[0].value;
			let powerSupplies: PowerSupply[] = [];
			for (let char of value) {
				let status: PowerStatus;
				switch (char) {
					case '0':
						status = PowerStatus.failure;
						break;
					case '1':
						status = PowerStatus.ok;
						break;
					default:
					case 'x':
						status = PowerStatus.unknown;
						break;
				}
				powerSupplies.push({
					status: status
				});
			}
			this.power = powerSupplies;
		}
		return this.power;
	}

	private async getCageTrapReciversAsync() {
		let cageTrapRecivers: TrapReciver[] = [];
		let table = await this.snmp.table(CAGETRAPRECEIVERS_TABLE);
		for (let row of table) {
			let trapReciver: TrapReciver = new TrapReciver();
			for (let varbind of row.items) {
				let value = varbind.value;
				if (varbind.name == 'levelFilter') {
					value = TrapLevelFilter[value];
				}
				trapReciver[varbind.name] = value;
			}
			cageTrapRecivers.push(trapReciver);
		}

		this.network = cageTrapRecivers;
		return cageTrapRecivers;
	}

	private async getCageGroupsAsync() {
		let cageGroups: CageGroup[] = [];
		let table = await this.snmp.table(CAGEGROUP_TABLE);
		for (let row of table) {
			let cageGroup = new CageGroup();
			for (let varbind of row.items) {
				let value = varbind.value;
				if (varbind.name == 'type') {
					value = GroupType[value];
				}
				if (varbind.name == 'redundancySwitch') {
					value = GroupRedundancy[value];
				}
				if (varbind.name == 'status') {
					value = GroupStatus[value];
				}
				cageGroup[varbind.name] = value;
			}
			cageGroup.index = row.index;
			cageGroups.push(cageGroup);
		}
		this.cageGroups = cageGroups;
		return cageGroups;
	}

	private async getCageModulsAsync() {
		let cageModules: CageModule[] = [];
		let table = await this.snmp.table(CAGEMODULE_TABLE);
		for (let row of table) {
			let cageModule = new CageModule();
			for (let varbind of row.items) {
				let value = varbind.value;
				if (varbind.name == 'type') {
					value = ModuleType[value];
				}
				if (varbind.name == 'status') {
					value = ModuleStatus[value];
				}
				if (varbind.name == 'statusLED') {
					value = ModuleStatusLED[value];
				}
				if (varbind.name == 'lna') {
					value = LNAStatus[value];
				}
				if (varbind.name == 'biasT') {
					value = BiasTState[value];
				}
				if (varbind.name == 'laser') {
					value = LaserStatus[value];
				}
				if (varbind.name == 'rfLinkTest') {
					value = RfLinkTest[value];
				}
				if (varbind.name == 'measRfLevel') {
					value = MeasRfLevel[value];
				}
				if (varbind.name == 'monPlan') {
					value = MonPlan[value];
				}
				if (varbind.name == 'setDefaults') {
					value = SetDefaults[value];
				}
				if (varbind.name == 'restoreFactory') {
					value = RestoreFactory[value];
				}
				cageModule[varbind.name] = value;
			}
			cageModule.index = row.index;
			let res = /^(\d).(\d)/.exec(row.index);
			if (res) {
				let groupIndex = Number(res[1]) - 1;
				cageModule.group = this.cageGroups[groupIndex];
			}
			cageModules.push(cageModule);
		}
		this.cageModules = cageModules;
		return cageModules;
	}

	private async getCageEventsAsync() {
		let cageEventlog: EventLogItem[] = [];
		let table = await this.snmp.table(CAGEEVENTS_TABLE);
		for (let row of table) {
			let logitem = new EventLogItem();
			for (let varbind of row.items) {
				let value = varbind.value;
				if (varbind.name == 'level') {
					value = EventLevel[value];
				}
				logitem[varbind.name] = value;
			}

			this.interpretLogLine(logitem);

			cageEventlog.push(logitem);
		}
		this.cageEventlog = cageEventlog;
		return cageEventlog;
	}

	async getLastEvent(): EventLogItem {
		let logline = new EventLogItem();
		for (let item of CAGEEVENTS_VARBINDS) {
			item.index = 1;
			let varbind = await this.snmp.get(item);
			logline[varbind.name] = varbind.value;
		}

		this.interpretLogLine(logline);
		return logline;
	}

	interpretLogLine(line: EventLogItem) {
		let lineStyle1 = /Group\s*(\d),\s*Slot\s*(\d),\s*([\w]*)\s=\s*(\w*)\s*\((\d)\)/;
		let lineStyle2 = /Group\s*(\d),\s*Slot\s*(\d),\s*([\w\W]*)/;
		let lineStyle3 = /Group\s*(\d),\s*([\w\W]*)/;
		let lineStyles = [lineStyle1, lineStyle2, lineStyle3];
		for (let regex of lineStyles) {
			let matches = line.detail.match(regex);
			if (matches) {
				line.group = this.cageGroups.find((item) => {
					return item.index == matches[1].trim();
				});
				if (matches.length > 2) {
					line.slot = matches[2].trim();
					line.module = this.cageModules.find((item) => {
						return item.slot == line.slot;
					});
				}

				if (matches.length > 3) {
					line.property = matches[3].trim();
					line.value = matches[5];
				}
				break;
			}
		}
	}
}
