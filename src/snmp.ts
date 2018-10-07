import * as snmp from 'net-snmp';
import { SnmpVarBind, SnmpTableColumn, SnmpTable } from 'rfof-common';
import { execSync } from 'child_process';


export class SNMP {
	private community;
	private server;
	session;
	errorLog: string[] = [];
	constructor() {
		this.community = 'cMtc-04_3159';
		let options = {
			port: 161,
			version: snmp.Version2c
		};
		this.server = process.env.RFOF_CAGE_ADDRESS || 'localhost';
		this.session = new snmp.Session(this.server, this.community , options);
		this.session.on('error', (err) => {
			throw err;
		});
	}

	walk(oid): Promise<SnmpVarBind[]> {
		return new Promise((resolve, reject) => {
			this.session.walk (oid, 20, (varbinds) => {
				let result: SnmpVarBind[] = [];
				for (let i = 0; i < varbinds.length; i++) {
					if (snmp.isVarbindError (varbinds[i])) {
						this.errorLog.push(snmp.varbindError(varbinds[i]));
					}
					else {
						result.push({
							oid: varbinds[i].oid,
							value: varbinds[i].value.toString()
						});
					}
				}
				return resolve(result);
			}, (err) => {
				if (err) {
				reject(err);
			}});
		});
	}

	get(varBinds: SnmpVarBind[]) {
		return new Promise((resolve, reject) => {
			try {
				let oids: string[] = varBinds.map((key) => {return key.oid; });
				this.session.get(oids, (err, varbinds) => {
					if (err) {
						return reject(err);
					} else {
						let result: SnmpVarBind[] = [];
						for (let i = 0; i < varbinds.length; i++) {
							if (snmp.isVarbindError (varbinds[i])) {
								this.errorLog.push(snmp.varbindError (varbinds[i]));
							}
							else {
								let varBind = varBinds.find((varBind) => {
									return varBind.oid == varbinds[i].oid;
								});
								varBind.value = varbinds[i].value.toString();
							}
						}
						return resolve(varBinds);
					}
				});
			} catch (err) {
				return reject(err);
			}
		});
	}

	table(schema: SnmpTable) {
		return new Promise((resolve, reject) => {
			try {
				this.session.table(schema.oid, (err, result) => {
					if (err) {
						return reject(err);
					} else {
						let table = [];
					for (let rowIndex in result) {
						let tableRow = {index: rowIndex, columns: []};
						let row = result[rowIndex];
						for (let cellIndex in row) {
							let cell = row[cellIndex];
							let column: SnmpTableColumn = schema.columns.find((column) => {
								return column.index == cellIndex;
							});
							if (column) {
								column.value = cell.toString();
								tableRow.columns.push({...column});
							}
						}
						table.push(tableRow);
					}
					resolve(table);
					}
				});
			} catch (err) {
				reject(err);
			}
		});
	}

	set(varBinds: SnmpVarBind[]) {
		let results = [];
		for (let varBind of varBinds) {
			let command = this.buildSetCommand(varBind.command, {
				index: varBind.index,
				value: String(varBind.value),
				community: this.community,
				server: this.server
			});
			console.log(command);
			let result = execSync(command);
			results.push(result);
		}
		return results;
	}

	private buildSetCommand(command, data) {
		return command.replace(/\{\{(.*?)\}\}/g, (i, match) => {
			return data[match];
		});
	}

	close() {
		this.session.close();
	}
}

