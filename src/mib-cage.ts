import { Cage, CageGroup, CageModule, EventlogItem, PowerSupply, PowerStatus, SnmpVarBind, SnmpTableColumn, TrapReciver, CAGE_VARBINDS, POWER_VARBINDS, CAGENETWORK_TABLE, CAGEGROUP_TABLE, CAGEMODULE_TABLE, CAGEEVENTS_TABLE } from 'rfof-common';
import { SNMP } from './snmp';

export class MIBCage {
	private snmp;
	cage: Cage = new Cage();
	power: PowerSupply[] = [];
	network: TrapReciver[] = [];
	cageGroups: CageGroup[] = [];
	cageModules: CageModule[] = [];
	cageEventlog: EventlogItem[] = [];

	getInfo() {
		return this.getInfoAsync();
	}

	getPowerSupply() {
		return this.getPowerSupplyAsync();
	}

	getTrapRecivers() {
		return this.getTrapReciversAsync();
	}

	getGroups() {
		return this.getGroupsAsync();
	}

	getModules() {
		return this.getModulesAsync();
	}

	getEvents() {
		return this.getEventsAsync();
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
			this.cage[varBind.name] = varBind.value;
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
				trapReciver[cell.name] = cell.value;
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
				cageGroup[cell.name] = cell.value;
			}
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
				cageModule[cell.name] = cell.value;
			}
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
				logitem[cell.name] = cell.value;
			}
			cageEventlog.push(logitem);
		});
		this.cageEventlog = cageEventlog;
		return cageEventlog;
	}
}
