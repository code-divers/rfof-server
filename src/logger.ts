import * as winston from 'winston';
import { environment } from './environments/environment';

export const logger = winston.createLogger({
	level: environment.logger,
	format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.splat(),
		winston.format.simple()),
	transports: [
		new winston.transports.Console({format: winston.format.combine(
		winston.format.timestamp(),
		winston.format.splat(),
		winston.format.cli())
	})]
});
