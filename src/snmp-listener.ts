import * as dgram from 'dgram';
import { EventEmitter } from 'events';
import { logger } from './logger';
import { EventLogItem, EventLevel } from 'rfof-common';

export class SNMPListener {
	port = 162;
	messageEmitter: EventEmitter;

	constructor() {
		this.messageEmitter = new EventEmitter;
	}

	start() {
		try {
			let self = this;
			const server = dgram.createSocket('udp4');
			server.on('listening', function () {
				let address = server.address();
				logger.info('UDP server listening on %s', address);
			});
			server.on('message', function (message: any, remote) {
				logger.debug('recived message from snmp listener', message, remote);
				self.messageEmitter.emit('message', message);
			});
			server.on('error', function(err) {
				logger.error('snmp listener error %s', err);
			});
			server.bind(this.port);

		} catch (err) {
			logger.error('failed to start listener %s', err);
		}
	}
}