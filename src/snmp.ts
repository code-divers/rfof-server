import * as snmp from 'net-snmp';
import { SnmpVarBind, SnmpTableColumn, SnmpTable } from 'rfof-common';

export class SNMP {
	session;
	errorLog: string[] = [];
	constructor() {
		let options = {
			port: 161,
			version: snmp.Version2c
		};
		this.session = new snmp.Session('localhost', 'public', options);
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

	close() {
		this.session.close();
	}
}

