import { SNMPListener } from './snmp-listener';
import { logger } from './logger';

let listener = new SNMPListener();
listener.messageEmitter.on('message', (message) => {
	logger.debug('Recived a message %s from snmp listener', message);
});