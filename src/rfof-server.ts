let express = require('express');
let https = require('https');
let http = require('http');
let cors = require('cors');
let path = require('path');
import { MIBCage } from './mib-cage';

export class RfofServer {
	app;
	port: number;
	constructor(port: number) {
		this.port = port;
		this.app = express();
		this.app.use(cors());
		this.setApiRoute();
		this.setStaticRoute();
	}
	start() {
		return new Promise((resolve, reject) => {
			let server = http.createServer(this.app);
			server.listen(this.port, () => {
				resolve(server);
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
			let mib = new MIBCage();
			mib.getInfo().then(() => {
				res.send({
					data: mib.cage
				});
			}).catch((err) => {
				console.log(err);
				res.status(500).send(err);
			});
		});
		app.get('/api/cage/power', (req, res) => {
			let mib = new MIBCage();
			mib.getPowerSupply().then(() => {
				res.send({
					data: mib.power
				});
			}).catch((err) => {
				console.log(err);
				res.status(500).send(err);
			});
		});
		app.get('/api/cage/network', (req, res) => {
			let mib = new MIBCage();
			mib.getTrapRecivers().then(() => {
				res.send({
					data: mib.network
				});
			}).catch((err) => {
				console.log(err);
				res.status(500).send(err);
			});
		});
		app.get('/api/cage/groups', (req, res) => {
			let mib = new MIBCage();
			mib.getGroups().then(() => {
				res.send({
					data: mib.cageGroups
				});
			}).catch((err) => {
				console.log(err);
				res.status(500).send(err);
			});
		});
		app.get('/api/cage/modules', (req, res) => {
			let mib = new MIBCage();
			mib.getModules().then(() => {
				res.send({
					data: mib.cageModules
				});
			}).catch((err) => {
				console.log(err);
				res.status(500).send(err);
			});
		});
		app.get('/api/cage/events', (req, res) => {
			let mib = new MIBCage();
			mib.getEvents().then(() => {
				res.send({
					data: mib.cageEventlog
				});
			}).catch((err) => {
				console.log(err);
				res.status(500).send(err);
			});
		});
	}
}