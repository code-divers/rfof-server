import * as snmp from 'net-snmp';
import { SnmpVarBind, SnmpTableColumn, SnmpTable } from 'rfof-common';
import { execSync, exec } from 'child_process';
import { logger } from './logger';


export class SNMP {
	private community;
	private server;
	private commands = [];
	constructor() {
		this.community = 'cMtc-04_3159';
		this.server = process.env.RFOF_CAGE_ADDRESS || 'localhost';
	}

	queueCommand(command, callback) {
		let commandItem = this.commands.find((item) => {
			return item.command == command;
		});
		if (!commandItem) {
			commandItem = {command: command, callbacks: []};
			this.commands.push(commandItem);
		}
		commandItem.callbacks.push(callback);
		if (this.commands.length == 1 && this.commands[0].callbacks.length == 1) {
			this.executeQueu();
		}
	}

	executeQueu() {
		if (this.commands.length > 0) {
			let commandItem = this.commands[0];
			exec(commandItem.command, (err, out) => {
				logger.debug('Executed command %s with result %s', commandItem.command, out);
				if (err) {
					logger.error('failed execute snmp command %s with err %s', commandItem.command, err);
				}
				for (let callback of commandItem.callbacks) {
					callback(err, out);
				}
				let idx = this.commands.findIndex(item => {
					return item.command == commandItem.command;
				});
				this.commands.splice(idx, 1);
				this.executeQueu();
			});
		}
	}

	get(varBind: SnmpVarBind) {
		return new Promise((resolve, reject) => {
			let command = `snmpget -t 60 -c ${this.community} -v 2c ${this.server} ${varBind.oid}`;
			if (varBind.index) {
				command += `.${varBind.index}`;
			}
			this.queueCommand(command, (err, out) => {
				if (err) {
					return reject(err);
				} else {
					let result = out;
					// console.log(result);
					let stringRegex = /^RFoF-Cage-MIB::(\w*)\s*=\s*STRING:\s*"([\w\s]*)"/;
					let integerRegex = /^RFoF-Cage-MIB::(\w*)\s*=\s*INTEGER:\s*(\d*)/;
					let integerRegexIdx = /^RFoF-Cage-MIB::(\w*)\s*[.\d]*\s*=\s*INTEGER:\s*\w*\((\d*)\)/;
					let stringRegexIdx = /^RFoF-Cage-MIB::(\w*)\s*[.\d]*\s*=\s*STRING: "([\s\d\w\W]*)"/;
					let regexSatements = [stringRegex, integerRegex, integerRegexIdx, stringRegexIdx];

					varBind.value = null;
					for (let regex of regexSatements) {
						let matches = result.match(regex);
						if (matches) {
							varBind.value = matches[2].trim();
							break;
						}
					}
					return resolve(varBind);
				}
			});
		});
	}

	table(schema: SnmpTable) {
		return new Promise((resolve, reject) => {
			let table = [];
			let command = `snmptable -t 60 -v 2c -c ${this.community} -Ci -Os ${this.server} RFoF-Cage-MIB::${schema.systemName}`;
			this.queueCommand(command, (err, out) => {
				if (err) {
					return reject(err);
				} else {
					let result = out;
					let lines = result.split(/\r?\n/);
					for (let line of lines) {
						let matches = line.match(new RegExp(schema.regex, 'i'));
						if (matches) {
							let row = {
								index: null,
								items: []
							};
							for (let varbind of schema.columns) {
								varbind.value = matches[varbind.tableIndex + 1].trim();
								row.items.push({... varbind});
							}
							row.index = matches[1].trim();
							table.push(row);
						}
					}
					return resolve(table);
				}
			});
		});
	}

	set(varbind: SnmpVarBind) {
		return new Promise((resolve, reject) => {
			let command = `snmpset -t 60 -Os -v2c -c ${this.community} ${this.server} RFoF-Cage-MIB::${varbind.systemName}.${varbind.index} ${varbind.type} ${varbind.value}`;
			this.queueCommand(command, (err, out) => {
				if (err) {
					return reject(err);
				} else {
					return resolve(out);
				}
			});
		});
	}
}

