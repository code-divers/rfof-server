import * as dgram from 'dgram';
import { EventEmitter } from 'events';
import { logger } from './logger';

export class SNMPListener {
	port = 162;
	messageEmitter: EventEmitter;

	constructor() {
		this.messageEmitter = new EventEmitter;
		this.start();
	}

	start() {
		try {
			let self = this;
			const server = dgram.createSocket('udp4');
			server.on('listening', function () {
				let address = server.address();
				logger.info('UDP server listening on %s', address);
			});
			server.on('message', function (message, remote) {
				self.messageEmitter.emit('message', {data: message, remote: remote});
				logger.debug('Recived message %s from cage %s', message, remote);
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