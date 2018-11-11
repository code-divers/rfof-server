import { Cage, CageGroup, CageModule, EventlogItem, PowerSupply, PowerStatus, SnmpVarBind, SnmpTableColumn, TrapReciver, CAGE_VARBINDS, CAGE_MODULE_VARBINDS, POWER_VARBINDS, CAGENETWORK_TABLE, CAGEGROUP_TABLE, CAGEMODULE_TABLE, CAGEEVENTS_TABLE, CAGE_GROUP_VARBINDS } from 'rfof-common';
import { SNMP } from './snmp';
import { Cache } from './cache';
import { environment } from './environments/environment';
import * as snmp from 'net-snmp';

import { CAGE, CAGE_EVENTS, CAGE_GROUPS, CAGE_MODULES, CAGE_POWERSUPPLY, CAGE_TRAPRECIVERS } from 'rfof-common';

export class MIBCage {
	private snmp;
	private cache;
	private timer;
	cage: Cage = new Cage();
	power: PowerSupply[] = [];
	network: TrapReciver[] = [];
	cageGroups: CageGroup[] = [];
	cageModules: CageModule[] = [];
	cageEventlog: EventlogItem[] = [];

	constructor() {
		this.cache = new Cache(120);
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
		let varBinds: SnmpVarBind[] = [];
		if (currentModule.lna != module.lna) {
			varBinds.push(this.createModuleVarBind(module.index, 'lna', module.lna));
		}
		if (currentModule.atten != module.atten) {
			varBinds.push(this.createModuleVarBind(module.index, 'atten', module.atten));
		}
		if (currentModule.biasT != module.biasT) {
			varBinds.push(this.createModuleVarBind(module.index, 'biasT', module.biasT));
		}
		if (currentModule.laser != module.laser) {
			varBinds.push(this.createModuleVarBind(module.index, 'laser', module.laser));
		}
		if (currentModule.rfLinkTest != module.rfLinkTest) {
			varBinds.push(this.createModuleVarBind(module.index, 'rfLinkTest', module.rfLinkTest));
		}
		if (currentModule.rfLinkTestTime != module.rfLinkTestTime) {
			varBinds.push(this.createModuleVarBind(module.index, 'rfLinkTestTime', module.rfLinkTestTime));
		}
		if (currentModule.monInterval != module.monInterval) {
			varBinds.push(this.createModuleVarBind(module.index, 'monInterval', module.monInterval));
		}
		if (currentModule.optAlarmLevel != module.optAlarmLevel) {
			varBinds.push(this.createModuleVarBind(module.index, 'optAlarmLevel', module.optAlarmLevel));
		}
		if (currentModule.setDefaults != module.setDefaults) {
			varBinds.push(this.createModuleVarBind(module.index, 'setDefaults', module.setDefaults));
		}
		if (currentModule.restoreFactory != module.restoreFactory) {
			varBinds.push(this.createModuleVarBind(module.index, 'restoreFactory', module.restoreFactory));
		}

		this.snmp = new SNMP();
		let result = await this.snmp.set(varBinds);
		this.snmp.close();

		this.cageModules[index] = module;
		this.cache.del('cage-modules');
		return result;
	}

	createModuleVarBind(index, columnName, value) {
		let moduleColumns = CAGE_MODULE_VARBINDS;
		let varBind = moduleColumns.find(column => {
			return column.name == columnName;
		});
		varBind.value = value;
		varBind.index = index;
		varBind.oid += '.' + index;
		return varBind;
	}

	initiateTimer() {
		if (this.timer) {
			clearTimeout(this.timer);
		}
		this.timer = setTimeout(this.updateCache.bind(this), 50);
	}

	async updateCache(refresh = false) {
		try {
			if (!environment.mock) {
				await this.getInfo(refresh);
				await this.getPowerSupply(refresh);
				await this.getTrapRecivers(refresh);
				await this.getGroups(refresh);
				await this.getModules(refresh);
				await this.getEvents(refresh);
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

	getInfo(refresh) {
		if(refresh) this.cache.del('cage-info');
		return this.cache.get('cage-info', () => {
			return this.getInfoAsync().then(() => {
				return this.cage;
			});
		});
	}

	getPowerSupply(refresh) {
		if(refresh) this.cache.del('cage-power');
		return this.cache.get('cage-power', () => {
			return this.getPowerSupplyAsync().then(() => {
				return this.power;
			});
		});
	}

	getTrapRecivers(refresh) {
		if(refresh) this.cache.del('cage-network');
		return this.cache.get('cage-network', () => {
			return this.getTrapReciversAsync().then(() => {
				return this.network;
			});
		});
	}

	getGroups(refresh) {
		if(refresh) this.cache.del('cage-groups');
		return this.cache.get('cage-groups', () => {
			return this.getGroupsAsync().then(() => {
				return this.cageGroups;
			});
		});
	}

	getModules(refresh) {
		if(refresh) this.cache.del('cage-modules');
		return this.cache.get('cage-modules', () => {
			return this.getModulesAsync().then(() => {
				return this.cageModules;
			});
		});
	}

	getEvents(refresh) {
		if(refresh) this.cache.del('cage-events');
		return this.cache.get('cage-events', () => {
			return this.getEventsAsync().then(() => {
				return this.cageEventlog;
			});
		});
	}

	private async getInfoAsync() {
		this.snmp = new SNMP();
		await this.getCageInfoAsync();
		this.snmp.close();
	}

	private async getPowerSupplyAsync() {
		this.snmp = new SNMP();
		await this.getCagePowerSupplyAsync();
		this.snmp.close();
	}

	private async getTrapReciversAsync() {
		this.snmp = new SNMP();
		await this.getCageTrapReciversAsync();
		this.snmp.close();
	}

	private async getGroupsAsync() {
		this.snmp = new SNMP();
		await this.getCageGroupsAsync();
		this.snmp.close();
	}

	private async getModulesAsync() {
		this.snmp = new SNMP();
		await this.getCageGroupsAsync();
		await this.getCageModulsAsync();
		this.snmp.close();
	}

	private async getEventsAsync() {
		this.snmp = new SNMP();
		await this.getCageEventsAsync();
		this.snmp.close();
	}

	private async getCageInfoAsync() {
		let values: SnmpVarBind[] = await this.snmp.get(CAGE_VARBINDS);
		values.map(varBind => {
			this.cage[varBind.name] = varBind.value.trim();
		});
		return this.cage;
	}

	private async getCagePowerSupplyAsync() {
		let values: SnmpVarBind[] = await this.snmp.get(POWER_VARBINDS);
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
		return this.power;
	}

	private async getCageTrapReciversAsync() {
		let cageTrapRecivers: TrapReciver[] = [];
		let table = await this.snmp.table(CAGENETWORK_TABLE);
		table.map((row) => {
			let trapReciver: TrapReciver = {};
			for (let cell of row.columns) {
				trapReciver[cell.name] = cell.value.trim();
			}
			cageTrapRecivers.push(trapReciver);
		});
		this.network = cageTrapRecivers;
		return cageTrapRecivers;
	}

	private async getCageGroupsAsync() {
		let cageGroups: CageGroup[] = [];
		let table = await this.snmp.table(CAGEGROUP_TABLE);
		table.map((row) => {
			let cageGroup = new CageGroup();
			for (let cell of row.columns) {
				cageGroup[cell.name] = cell.value.trim();
			}
			cageGroup.index = row.index;
			cageGroups.push(cageGroup);
		});
		this.cageGroups = cageGroups;
		return cageGroups;
	}

	private async getCageModulsAsync() {
		let cageModules: CageModule[] = [];
		let table = await this.snmp.table(CAGEMODULE_TABLE);
		table.map((row) => {
			let cageModule = new CageModule();
			for (let cell of row.columns) {
				cageModule[cell.name] = cell.value.trim();
			}
			cageModule.index = row.index;
			let res = /^(\d).(\d)/.exec(row.index);
			if (res) {
				let groupIndex = Number(res[1]) - 1;
				cageModule.group = this.cageGroups[groupIndex];
			}
			cageModules.push(cageModule);
		});
		this.cageModules = cageModules;
		return cageModules;
	}

	private async getCageEventsAsync() {
		let cageEventlog: EventlogItem[] = [];
		let table = await this.snmp.table(CAGEEVENTS_TABLE);
		table.map((row) => {
			let logitem: EventlogItem = {};
			for (let cell of row.columns) {
				logitem[cell.name] = cell.value.trim();
			}
			cageEventlog.push(logitem);
		});
		this.cageEventlog = cageEventlog;
		return cageEventlog;
	}
}
