import { RfofServer } from './rfof-server';

const server = new RfofServer(20080);
server.start().then((result) => {
	console.log(result[0].address(), result[1].engine.generateId());
}).catch((err) => {
	console.log(err);
});
