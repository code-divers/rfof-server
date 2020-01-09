let express = require('express');
let https = require('https');
let http = require('http');
let cors = require('cors');
let path = require('path');
let bodyParser = require('body-parser');

import { environment } from './environments/environment';
import { MIBCage } from './mib-cage';
import { logger } from './logger';
import { CageState } from 'rfof-common';

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
			events: null,
			state: null,
		};
	}
	start() {
		return new Promise((resolve, reject) => {
			this.mib.on('sensors', (module) => {
				logger.debug('sensors updated for module %s in slot %s', module.name, module.slot);
				this.cache.modules.map((item) => {
					if (item.slot == module.slot) {
						item = module;
					}
				});
				this.io.emit('sensors', module);
			});
			this.mib.on('moduleupdate', (module) => {
				logger.debug('module %s at slot %s updated', module.name, module.slot);
				let idx = this.cache.modules.findIndex(item => {
					item.slot == module.slot;
				});
				if (idx > -1) {
					this.cache.modules[idx] = module;
					this.io.emit('moduleupdate', module);
				}
			});
			this.mib.on('flush', (data) => {
				logger.info('MIB cage data flushed', data);
				this.cache = {...this.cache, ...data};
			});
			this.mib.on('eventlogline', (logline) => {
				logger.debug('new logline added at %s', logline.time);
				if (this.cache.events) {
					this.cache.events.unshift(logline);
					this.io.emit('eventlogline', logline);
				}
			});

			this.mib.on('slotStatusChanged', (module, group) => {
				logger.debug('slot status changed %s group %s', module, group);
				this.io.emit('slotStatusChanged', module, group);
			});

			this.mib.on('cageStateChanged', (state: CageState) => {
				this.cache.state = state;
				this.io.emit('cageStateChanged', state);
			});

			let rest = http.createServer(this.app);
			this.io = require('socket.io')(rest);
			this.io.on('connection', (socket) => {
				logger.info('Web socket user connected');
				socket.on('disconnect', () => {
					logger.info('Web socket user disconnected');
				});
			});
			rest.listen(this.port, () => {
				this.mib.start().then(() => {
					resolve(rest.address());
				});
			});
		});
	}

	private setStaticRoute() {
		let app = this.app;
		app.use('/', express.static(path.join(__dirname, environment.clientFolder)));
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
		app.get('/api/cage/state', (req, res) => {
			res.send({
				data: this.cache.state
			});
		});
		app.get('/api/test/:message', (req, res) => {
			let message = null;
			switch (req.params.message) {
				case '1':
					message = 'notify, Module type RFoF2R5FR-PA-11 S/N 70322886 in slot 5 was removed';
					break;
				case '2':
					message = 'notify, Added module type RFoF2R5FR-PA-11 S/N 70322886 in slot 5';
					break;
				case '3':
					message = 'notify, Error: Group 1, Slot(5) T2, missing or communication failure';
					break;
				case '4':
					message = 'notify, Recovery: Group 3, Slot(13) RFin5, Optical signal restored';
					break;
			}
			this.mib.testTrap(message).then((result) => {
				res.send({
					data: result
				});
			});
		});
		app.get('/api/cage/module/:slot', (req, res) => {
			const idx = this.cache.modules.findIndex(item => {
				return Number(item.slot) == req.params.slot;
			});
			if (idx > -1) {
				const module = this.cache.modules[idx];
				this.mib.sampleModuleSensors(module).then(result => {
					res.send({
						data: result
					});
				}).catch(err => {
					res.status(500).send({ error: err });
				});
			} else {
				res.status(500).send({ error: `no module found in slot ${req.params.slot}` });
			}
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
		app.post('/api/cage/settings', (req, res) => {
			this.mib.setCageSettingsParameter(req.body.settings).then(result => {
				res.send({
					data: result
				});
			}).catch(err => {
				res.status(500).send({ error: err });
			});
		});
	}
}