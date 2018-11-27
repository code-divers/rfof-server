import { Cage, CageGroup, GroupType, GroupRedundancy, GroupStatus, CageModule, ModuleType, ModuleStatus, ModuleStatusLED, LNAStatus, BiasTState, LaserStatus, MeasRfLevel, SetDefaults, RestoreFactory, EventLogItem, EventLevel, PowerSupply, PowerStatus, SnmpVarBind, TrapReciver, TrapLevelFilter, MonPlan, RfLinkTest, CAGE_VARBINDS, CAGE_MODULE_VARBINDS, POWER_VARBINDS, TRAPRECEIVERS_VARBINDS, CAGETRAPRECEIVERS_TABLE, CAGEGROUP_TABLE, CAGEMODULE_TABLE, CAGEEVENTS_TABLE, CAGE_GROUP_VARBINDS } from 'rfof-common';
import { SNMP } from './snmp';
import { Cache } from './cache';
import { environment } from './environments/environment';
import { EventEmitter } from 'events';
import { SNMPListener } from './snmp-listener';

import { CAGE, CAGE_EVENTS, CAGE_GROUPS, CAGE_MODULES, CAGE_POWERSUPPLY, CAGE_TRAPRECIVERS } from 'rfof-common';

export class MIBCage extends EventEmitter {
	private snmp;
	private snmpListener: SNMPListener;
	private cache;
	private cacheUpdating = false;
	private sampleTimer;
	private updateCacheTimer;
	cage: Cage = new Cage();
	power: PowerSupply[] = [];
	network: TrapReciver[] = [];
	cageGroups: CageGroup[] = [];
	cageModules: CageModule[] = [];
	cageEventlog: EventLogItem[] = [];

	constructor() {
		super();
		this.cache = new Cache(120);
		this.snmp = new SNMP();
		this.snmpListener = new SNMPListener();

		let self = this;
		this.snmpListener.messageEmitter.on('message', (message) => {
			console.log('Message from cage:', message.data.toString('utf-8'));
			console.log('cacheUpdating:', self.cacheUpdating);
			if (!self.cacheUpdating) {
				self.updateCache().then(() => {
					console.log('Flushed mib cache');
				}).catch((err) => {
					console.log('error white flushing cache', err);
				});
			}
		});
	}

	public startRfLinkTestSampler(module: CageModule) {
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

	public showRFLevelSampler(module: CageModule) {
		this.sampleModuleSensors(module).then(updatedModule => {
			this.emit('sensors', updatedModule);
		});
	}

	async sampleModuleSensors(module: CageModule) {
		let sensors = ['rfLevel', 'rfLinkTest', 'measRfLevel'];
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
		for(let varbind of varBinds){
			let value = await this.snmp.get(varbind);
			values.push(value);
		}
		values.map(varbind => {
			module[varbind.name] = varbind.value;
		});
		// console.log(values);
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
			this.cache.del('cage-groups');
			return result;
		}
		return null;
	}

	async setModuleParameter(module: CageModule) {
		let index = this.cageModules.findIndex((item) => {
			return item.slot == module.slot;
		});
		let currentModule = this.cageModules[index];

		let varBinds = CAGE_MODULE_VARBINDS.filter(varbind => {
			// console.log(varbind.name, currentModule[varbind.name], module[varbind.name]);
			if (currentModule[varbind.name] != module[varbind.name]) {
				varbind.value = module[varbind.name];
				varbind.index = module.index;
				return varbind;
			}
		});
		for(let varbind of varBinds){
			await this.snmp.set(varbind);
		}
		
		this.cageModules[index] = module;
		this.cache.set('cage-modules', this.cageModules);

		if (module.measRfLevel == MeasRfLevel.on) {
			this.showRFLevelSampler(module);
		}

		if (module.rfLinkTest == RfLinkTest.on) {
			this.startRfLinkTestSampler(module);
		}
		return varBinds;
	}

	async getFromCache() {
		if (!this.cacheUpdating) {
			try {
				if (!environment.mock) {
					await this.getInfo();
					await this.getPowerSupply();
					await this.getTrapRecivers();
					await this.getGroups();
					await this.getModules();
					await this.getEvents();
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
				// this.initiateTimer();
			}
		}
	}

	async updateCache() {
		try {
			this.cacheUpdating = true;
			await this.getInfoAsync();
			await this.getPowerSupplyAsync();
			await this.getTrapReciversAsync();
			await this.getModulesAsync();
			await this.getEventsAsync();
			this.cache.set('cage-info', this.cage);
			this.cache.set('cage-power', this.power);
			this.cache.set('cage-network', this.network);
			this.cache.set('cage-events', this.cageEventlog);
			this.cache.set('cage-modules', this.cageModules);
			this.cache.set('cage-groups', this.cageGroups);
		} finally {
			this.cacheUpdating = false;
		}
	}

	getInfo() {
		return this.cache.get('cage-info', () => {
			return this.getInfoAsync().then(() => {
				return this.cage;
			});
		});
	}

	getPowerSupply() {
		return this.cache.get('cage-power', () => {
			return this.getPowerSupplyAsync().then(() => {
				return this.power;
			});
		});
	}

	getTrapRecivers() {
		return this.cache.get('cage-network', () => {
			return this.getTrapReciversAsync().then(() => {
				return this.network;
			});
		});
	}

	getGroups() {
		return this.cache.get('cage-groups', () => {
			return this.getGroupsAsync().then(() => {
				return this.cageGroups;
			});
		});
	}

	getModules() {
		return this.cache.get('cage-modules', () => {
			return this.getModulesAsync().then(() => {
				return this.cageModules;
			});
		});
	}

	getEvents() {
		return this.cache.get('cage-events', () => {
			return this.getEventsAsync().then(() => {
				return this.cageEventlog;
			});
		});
	}

	private async getInfoAsync() {
		await this.getCageInfoAsync();
	}

	private async getPowerSupplyAsync() {
		await this.getCagePowerSupplyAsync();
	}

	private async getTrapReciversAsync() {
		await this.getCageTrapReciversAsync();
	}

	private async getGroupsAsync() {
		await this.getCageGroupsAsync();
	}

	private async getModulesAsync() {
		await this.getCageGroupsAsync();
		await this.getCageModulsAsync();
	}

	private async getEventsAsync() {
		await this.getCageEventsAsync();
	}

	private async getCageInfoAsync() {
		let values = [];
		for(let item of CAGE_VARBINDS){
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
		for(let item of POWER_VARBINDS){
			let varbind = await this.snmp.get(item);
			values.push(varbind);
		}
		if(values.length > 0){
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
			cageEventlog.push(logitem);
		}
		this.cageEventlog = cageEventlog;
		return cageEventlog;
	}
}
