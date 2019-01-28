import { logger } from './logger';
import { SNMP } from './snmp';
import { EventEmitter } from 'events';
import { environment } from './environments/environment';
import { CAGE_VARBINDS, CageState } from 'rfof-common';


export class SNMPGuard {
	state: CageState = CageState.off;
	snmp: SNMP;
	messageEmitter: EventEmitter;
	timer;
	constructor(snmp: SNMP) {
		this.snmp = snmp;
		this.messageEmitter = new EventEmitter;
	}

	start() {
		this.setTestTimeout();
	}

	setTestTimeout() {
		let self = this;
		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(function test() {
			self.testCommunication();
		}, environment.commTestInterval * 1000);
	}

	testCommunication() {
		let test = new Promise((resolve, reject) => {
			let varbind = CAGE_VARBINDS.find((item) => {
				return item.name == 'partNumber';
			});
			this.snmp.get(varbind).then(result => {
				resolve(result);
			}).catch(err => {
				reject(err);
			});
		});
		let stateHandler = (result) => {
			let state: CageState = null;
			if (result) {
				state = CageState.on;
			} else {
				state = CageState.off;
			}
			if (this.state != state) {
				logger.debug('state changed to %s', state);
				this.messageEmitter.emit('cageStateChanged', state);
			}
			this.state = state;
			this.setTestTimeout();
		};
		test.then(result => {
			stateHandler(result);
		}).catch(err => {
			logger.error('SNMP-Guard: failed to test test communication. %s', err.message);
			stateHandler(null);
		});

	}
}