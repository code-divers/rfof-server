import { RfofServer } from './rfof-server';
import { logger } from './logger';

const server = new RfofServer(20080);
server.start().then((result: any) => {
	logger.info(`REST server listening`, result);
}).catch((err) => {
	logger.error(`error starting server %s`, err.message);
});
