import { Cage, CageState, CageSettings, CageSlot, SlotStatus, LogfileStatus, CageGroup, GroupType, GroupRedundancy, GroupStatus, CageModule, ModuleType, ModuleStatus, ModuleStatusLED, LNAStatus, BiasTState, LaserStatus, MeasRfLevel, SetDefaults, RestoreFactory, EventLogItem, EventLevel, PowerSupply, PowerStatus, SnmpVarBind, TrapReciver, TrapLevelFilter, MonPlan, RfLinkTest, CAGE_VARBINDS, CAGE_SETTINGS_VARBINDS, CAGEEVENTS_VARBINDS, CAGE_MODULE_VARBINDS, POWER_VARBINDS, TRAPRECEIVERS_VARBINDS, CAGETRAPRECEIVERS_TABLE, CAGEGROUP_TABLE, CAGEMODULE_TABLE, CAGEEVENTS_TABLE, CAGE_GROUP_VARBINDS } from 'rfof-common';
import { SNMP } from './snmp';
import { Cache } from './cache';
import { environment } from './environments/environment';
import { EventEmitter } from 'events';
import { SNMPListener } from './snmp-listener';
import { SNMPGuard } from './snmp-guard';
import { CAGE, CAGE_EVENTS, CAGE_GROUPS, CAGE_MODULES, CAGE_POWERSUPPLY, CAGE_TRAPRECIVERS } from 'rfof-common';
import { logger } from './logger';

export class MIBCage extends EventEmitter {
	private snmp: SNMP;
	private snmpListener: SNMPListener;
	private snmpGuard: SNMPGuard;
	private sampleTimer;
	private moduleSampleTimer;
	private updateTimer;
	private updateCacheTimer;
	cage: Cage;
	power: PowerSupply[] = [];
	network: TrapReciver[] = [];
	cageGroups: CageGroup[] = [];
	cageModules: CageModule[] = [];
	cageEventlog: EventLogItem[] = [];

	constructor() {
		super();
		this.cage = new Cage();
		this.snmp = new SNMP();
		this.snmpListener = new SNMPListener();
		this.snmpGuard = new SNMPGuard(this.snmp);
		let self = this;
		this.snmpListener.messageEmitter.on('message', async(message) => {
			await self.handleMessage(message);
		});
		this.snmpGuard.messageEmitter.on('cageStateChanged', (state: CageState) => {
			if (state == CageState.on) {
				self.getData().then(() => {
					self.emit('cageStateChanged', state);
				});
			} else {
				self.emit('cageStateChanged', state);
			}
		});
	}

	public async start() {
		await this.snmp.start();
		await this.disableLogfile();
		this.snmpListener.start();
		this.snmpGuard.start();
	}

	public async testTrap(message) {
		return await this.handleMessage(message);
	}

	private async handleMessage(message) {
		let data = message.toString('ascii');
		let match = data.match(/(critical|warning|change|notify|system|Notification),\s*([\w\W]*)/i);
		if (match) {
			let logline = new EventLogItem();
			logline.time = new Date();
			let level = match[1];
			if (level == 'Notification') {
				level = 'notify';
			}
			logline.level = EventLevel[level.toLowerCase()];
			logline.detail = match[2];
			logger.info('Recived logline %s', logline.detail);

			this.interpretLogLine(logline);
			if (logline.psu != null) {
				this.power = logline.psu;
				this.emit('flush', {
					power: this.power
				});
			}
			if (logline.slot != null) {
				logline.module = this.cageModules.find((item) => {
					return item.slot == logline.slot;
				});
				if (!logline.module) {
					await this.getCageModulsAsync();
				}
			}

			if (logline.module) {
				if (logline.value == 'missing or communication failure') {
					logline.module.slotStatus = SlotStatus.out;
				} else if (logline.value == 'added module') {
					logline.module.slotStatus = SlotStatus.in;
				}
				this.emit('slotStatusChanged', logline.module);
				await this.startModuleUpdateSampler(logline.module, 1);
			}
			this.emit('eventlogline', logline);
			return logline;
		}
	}

	private async disableLogfile() {
		if (environment.snmpDisableLog) {
			let varbind = CAGE_SETTINGS_VARBINDS.find((item) => {
				return item.name == 'logfile';
			});
			await this.snmp.get(varbind);
			if (varbind.value == LogfileStatus.log) {
				varbind.value = LogfileStatus.suspendLog;
				await this.snmp.set(varbind);
			}
		}
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

	async startModuleUpdateSampler(module: CageModule, iterations) {
		await this.sleep(500);
		await this.sampleModuleSensors(module);
		if (iterations > 0) {
			iterations--;
			await this.startModuleUpdateSampler(module, iterations);
		}
	}

	async sampleModuleSensors(module: CageModule) {
		let sensors = ['statusLED', 'optPower', 'rfLevel', 'temp'];
		// 'rfLinkTest', 'rfTestTimer', 'measRfLevel', 'monTimer'];
		let varBinds = CAGE_MODULE_VARBINDS.filter((varbind) => {
			return sensors.find((sensor) => {
				return varbind.name == sensor;
			}) != null;
		});
		let values = [];
		for (let varbind of varBinds) {
			varbind.index = module.index;
			const result: any = await this.snmp.get(varbind);
			module[varbind.name] = result.value;
		}
		console.log('slot:', module.slot, 'index:', module.slot - 1, 'status:', module.statusLED);
		this.cageModules[module.slot - 1] = module;

		this.emit('sensors', module);
		return module;
	}

	async sleep(millis) {
		return new Promise(resolve => setTimeout(resolve, millis));
	}

	async setCageGroupParameter(group: CageGroup) {
		let cageGroup = this.cageGroups.find(item => {
			return item.index == item.index;
		});

		let fields = ['name', 'redundencySwitch'];

		let varBinds = CAGE_GROUP_VARBINDS.filter(varbind => {
			return fields.indexOf(varbind.name) > -1 && cageGroup[varbind.name] != group[varbind.name];
		});
		if (varBinds.length > 0) {
			varBinds.map((varbind) => {
				varbind.value = group[varbind.name];
				varbind.index = group.index;
				return varbind;
			});

			for (let varbind of varBinds) {
				await this.snmp.set(varbind);
				cageGroup[varbind.name] = varbind.value;
			}

			return varBinds;
		}
		return null;
	}

	async setModuleParameter(module: CageModule) {
		let index = this.cageModules.findIndex((item) => {
			return item.slot == module.slot;
		});
		let currentModule = this.cageModules[index];

		let fields = ['lna', 'atten', 'laser', 'measRfLevel', 'rfLinkTest', 'rfLinkTestTime', 'monPlan', 'monInterval', 'optPower', 'setDefaults', 'restoreFactory'];

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

	async setCageSettingsParameter(settings: CageSettings) {
		let varbinds = CAGE_SETTINGS_VARBINDS;
		for (let varbind of varbinds) {
			if (this.cage.settings[varbind.name] != settings[varbind.name]) {
				varbind.value = settings[varbind.name];
				await this.snmp.set(varbind);
				this.cage.settings[varbind.name] = varbind.value;
			}
		}
		return varbinds;
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
				events: this.cageEventlog,
				state: this.getCageState()
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
		values.map(varbind => {
			let value = varbind.value;
			let type = typeof this.cage[varbind.name];
			switch (type) {
				case 'number':
					value = Number(varbind.value);
					break;
			}
			this.cage[varbind.name] = varbind.value;
		});
		let settingsValues = [];
		for (let item of CAGE_SETTINGS_VARBINDS) {
			let varbind = await this.snmp.get(item);
			settingsValues.push(varbind);
		}
		this.cage.settings = new CageSettings();
		settingsValues.map(varbind => {
			let value = varbind.value;
			let type = varbind.type;
			switch (type) {
				case 'number':
					value = Number(varbind.value);
					break;
			}
			this.cage.settings[varbind.name] = varbind.value;
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
			for (let i = 0; i < value.length; i++) {
				let char = value.charAt(i);
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
					slot: i + 1,
					status: status
				});
			}
			this.power = powerSupplies;
		}
		return this.power;
	}

	private async getCageTrapReciversAsync() {
		let cageTrapRecivers: TrapReciver[] = [];
		let table: any = await this.snmp.table(CAGETRAPRECEIVERS_TABLE);
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
		let table: any = await this.snmp.table(CAGEGROUP_TABLE);
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
		let table: any = await this.snmp.table(CAGEMODULE_TABLE);
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
				this.cageGroups[groupIndex].modules.push(cageModule);
			}
			cageModules.push(cageModule);
		}
		this.cageModules = cageModules;
		return cageModules;
	}

	private async getCageEventsAsync() {
		let cageEventlog: EventLogItem[] = [];
		let table: any = await this.snmp.table(CAGEEVENTS_TABLE);
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
			let varbind: any = await this.snmp.get(item);
			logline[varbind.name] = varbind.value;
		}

		this.interpretLogLine(logline);
		return logline;
	}

	interpretLogLine(line: EventLogItem) {
		let lineStyle = /Added\s*module\s*type\s*([\w-]*)\s*S\/N\s*(\d*)\s*in\s*slot\s*([\d]*)/;
		let matches = line.detail.match(lineStyle);
		if (matches) {
			line.slot = matches[3];
			line.value = 'added module';
			return;
		}

		lineStyle = /PSU\s*(\d)\s*(is|has)\s*(OK|Not Installed|Failed)/;
		let lineStyle_g = /PSU\s*(\d)\s*(is|has)\s*(OK|Not Installed|Failed)/g;
		matches = line.detail.match(lineStyle_g);
		if (matches) {
			let power: PowerSupply = [];
			for (let match of matches) {
				let psuMatch = match.match(lineStyle);
				let powerSupply = new PowerSupply();
				powerSupply.slot = psuMatch[1];
				switch (psuMatch[3]) {
					case "OK":
						powerSupply.status = PowerStatus.ok;
						break;

					case "Failed":
						powerSupply.status = PowerStatus.failure;
						break;
					default:
					case "Not Installed":
						powerSupply.status = PowerStatus.unknown;
						break;
				}
				power.push(powerSupply);
			}
			line.psu = power;
			return;
		}

		let lineStyle1 = /Group\s*(\d),\s*Slot\((\d*)\)\s*(\w*),\s*([\w]*)\s=\s*(\w*)\s*\((\d)\)/;
		let lineStyle2 = /Group\s*(\d),\s*Slot\((\d*)\)\s*(\w*),\s*([\w\W]*)/;
		let lineStyle3 = /Group\s*(\d),\s*([\w\W]*)/;
		let lineStyles = [lineStyle1, lineStyle2, lineStyle3];
		for (let regex of lineStyles) {
			let matches = line.detail.match(regex);
			if (matches) {
				line.group = this.cageGroups.find((item) => {
					return item.index == matches[1].trim();
				});
				if (matches.length > 3) {
					line.slot = matches[2].trim();
				}

				if (matches.length > 5) {
					line.property = matches[4].trim();
					line.value = matches[6];
				} else if (matches.length > 4) {
					line.value = matches[4];
				}
				break;
			}
		}
	}

	getCageState() {
		return this.snmpGuard.state;
	}
}
