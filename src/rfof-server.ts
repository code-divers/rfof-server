let express = require('express');
let https = require('https');
let http = require('http');
let cors = require('cors');
let path = require('path');
let bodyParser = require('body-parser');

import { MIBCage } from './mib-cage';

export class RfofServer {
	app;
	io;
	timer;
	sample: Boolean = false;
	port: number;
	mib: MIBCage;
	constructor(port: number) {
		this.mib = new MIBCage();
		this.port = port;
		this.app = express();
		this.app.use(cors());
		this.app.use(bodyParser.json());
		this.setApiRoute();
		this.setStaticRoute();
	}
	start() {
		return new Promise((resolve, reject) => {
			return this.mib.updateCache().then(() => {
				let rest = http.createServer(this.app);
				rest.listen(this.port, () => {
					this.io = require('socket.io')(rest);
					this.io.on('connection', (socket) => {
					  console.log('user connected');
					  
					  socket.on('disconnect', function(){
					    console.log('user disconnected');
					  });
					  
					  socket.on('sample-sensors', () => {
					  	console.log('sample');
					  	 this.sampleSensors();
					  });
					  socket.on('stop-sample-sensors', () => {
					  	this.sample = false;
					  });
					});
					resolve([rest, this.io]);
				});
			});
		});
	}

	private sampleSensors() {
		this.sample = true;
		let self = this;
		this.timer = setTimeout(function sample(){
			self.mib.updateCache(true).then(result=>{
		  		let sensors = {
		  			modules: self.mib.cageModules
		  		};
		  		self.io.emit('sensors', sensors);
		  		if(self.sample){
		  			if(self.timer) clearTimeout(self.timer);
		  			self.timer = setTimeout(sample, 500);
		  		}
		  	})
		}, 500)
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
				data: this.mib.cage
			});
		});
		app.get('/api/cage/power', (req, res) => {
			res.send({
				data: this.mib.power
			});
		});
		app.get('/api/cage/network', (req, res) => {
			res.send({
				data: this.mib.network
			});
		});
		app.get('/api/cage/groups', (req, res) => {
			res.send({
				data: this.mib.cageGroups
			});
		});
		app.get('/api/cage/modules', (req, res) => {
			res.send({
				data: this.mib.cageModules
			});
		});
		app.get('/api/cage/events', (req, res) => {
			res.send({
				data: this.mib.cageEventlog
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