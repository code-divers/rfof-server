import * as dgram from 'dgram';
import { EventEmitter } from 'events';

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
				console.log('UDP Server listening on ' + JSON.stringify(address));
			});
			server.on('message', function (message, remote) {
				self.messageEmitter.emit('message', {data: message, remote: remote});
				console.log(remote.address + ':' + remote.port + ' - ' + message);
			});
			server.on('error', function(err) {
				console.log('snmp listener error:' + err);
			});
			server.bind(this.port);
		} catch (err) {
			console.log('Error from snmp server listener', err);
		}
	}
}