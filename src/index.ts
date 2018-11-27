import { RfofServer } from './rfof-server';

const server = new RfofServer(20080);
server.start().then((result: any) => {
	console.log('REST server listening on ' + JSON.stringify(result.address()));
}).catch((err) => {
	console.log(err);
});
