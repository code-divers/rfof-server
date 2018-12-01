let express = require('express');
let https = require('https');
let http = require('http');
let cors = require('cors');
let path = require('path');
let bodyParser = require('body-parser');

import { MIBCage } from './mib-cage';
import { logger } from './logger';

export class RfofServer {
	app;
	port: number;
	mib: MIBCage;
	io;
	cache;
	constructor(port: number) {
		this.port = port;
		this.app = express();
		this.app.use(cors());
		this.app.use(bodyParser.json());
		this.mib = new MIBCage();
		this.setApiRoute();
		this.setStaticRoute();
		this.cache = {
			cage: null,
			power: null,
			network: null,
			groups: null,
			modules: null,
			events: null
		};
	}
	start() {
		return new Promise((resolve, reject) => {
			this.mib.on('sensors', (module) => {
				logger.debug('sensors updated for module %s in slot %s', module.name, module.slot);
				this.cache.modules.map((item) => {
					if (item.slot == module.slot && item.name == module.name) {
						item = module;
					}
				});
				this.io.emit('sensors', module);
			});
			this.mib.on('moduleupdate', (module) => {
				logger.debug('module %s at slot %s updated', module.name, module.slot);
				let idx = this.cache.modules.findIndex(item => {
					item.slot == module.slot && item.name == module.name;
				});
				if (idx > -1) {
					this.cache.modules[idx] = module;
					this.io.emit('moduleupdate', module);
				}
			});
			this.mib.on('flush', (data) => {
				logger.debug('MIB cage data flushed', data);
				this.cache = {...this.cache, ...data};
			});
			this.mib.on('eventlogline', (logline) => {
				logger.debug('new logline added at %s', logline.time);
				this.cache.events.unshift(logline);
				this.io.emit('eventlogline', logline);
			});
			return this.mib.getData().then(() => {
				let rest = http.createServer(this.app);
				this.io = require('socket.io')(rest);
				this.io.on('connection', (socket) => {
					logger.info('Web socket user connected');
					socket.on('disconnect', () => {
						logger.info('Web socket user disconnected');
					});
				});
				rest.listen(this.port, () => {
					resolve(rest.address());
				});
			});
		});
	}

	private setStaticRoute() {
		let app = this.app;
		app.use('/', express.static(path.join(__dirname, '/../../rfof-client/dist/rfof')));
	}

	private setApiRoute() {
		let app = this.app;
		app.get('/api', (req, res) => {
			res.send('Rfof API REST Server v1.0.0');
		});
		app.get('/api/cage', (req, res) => {
			res.send({
				data: this.cache.cage
			});
		});
		app.get('/api/cage/power', (req, res) => {
			res.send({
				data: this.cache.power
			});
		});
		app.get('/api/cage/network', (req, res) => {
			res.send({
				data: this.cache.network
			});
		});
		app.get('/api/cage/groups', (req, res) => {
			res.send({
				data: this.cache.groups
			});
		});
		app.get('/api/cage/modules', (req, res) => {
			res.send({
				data: this.cache.modules
			});
		});
		app.get('/api/cage/events', (req, res) => {
			res.send({
				data: this.cache.events
			});
		});
		app.post('/api/cage/module', (req, res) => {
			this.mib.setModuleParameter(req.body.module).then(result => {
				res.send({
					data: result
				});
			}).catch(err => {
				res.status(500).send({ error: err });
			});
		});
		app.post('/api/cage/group', (req, res) => {
			this.mib.setCageGroupParameter(req.body.group).then(result => {
				res.send({
					data: result
				});
			}).catch(err => {
				res.status(500).send({ error: err });
			});
		});
	}
}