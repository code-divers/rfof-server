import { RfofServer } from './rfof-server';

const server = new RfofServer(20080);
server.start().then((server: any) => {
	console.log(server.address());
}).catch((err) => {
	console.log(err);
});
