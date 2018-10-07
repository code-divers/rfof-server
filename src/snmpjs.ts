import * as dgram from 'dgram';

export class SNMPTrap {
	server;
	constructor() {
		let server = dgram.createSocket('udp4');
		server.on('error', (err) => {
			console.log(`Server error ${err.message}`);
		});
		server.on('message', (msg, rinfo) => {
			console.log(`server got: ${msg} from ${rinfo.address}:${rinfo.port}`);
		});
		server.on('listening', () => {
			const address = server.address();
			console.log(`server is listening ${address}`);
		});

	}
}