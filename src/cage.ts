export class Cage {
	OID: string;
	description?: string;
	serial?: string;
	version?: string;
	versionDate?: string;
	psCount?: number;
	grCount?: number;
	slotsCount?: number;
}

export class CageGroup {
	name: string;
	type: GroupType;
	mdCount: number;
	redundencySwitch: GroupRedundency;
	status: GroupStatus;
}

export class CageModule {
	name: string;
	group: CageGroup;
	slot: number;
	type: ModuleType;
	status: ModuleStatus;
	statusLED: ModuleStatusLED;
	partNumber: string;
	serial: string;
	fwVer: string;
	rfLevel: string;
	temp: string;
	optPower: string;
	monTimer: string;
	rfTestTimer: string;
	atten: string;
	lna: LNAStatus;
	biasT: BiasTState;
	laser: LNAStatus;
	rfLinkTestTime: string;
	dfbBias: string;
	optAlarmLevel: string;
	monPlan: MonPlan;
	monInterval: string;
}

export class EventLogItem {
	time: Date;
	level: EventLevel;
	detail: string;
}

export class PowerSupply {
	status: PowerStatus
}

export class TrapReciver {
	ipAddress: string;
	levelFilter: TrapLevelFilter;
	community: string;
}

export enum PowerStatus {
	ok = 0,
	failure=1
}

export enum TrapLevelFilter {
	critical=0,
	warning=1, 
	change=2,
	notify=3,
	system=4
}

export enum GroupType {
	unspecified = 0,
	simple = 1,
	bidir = 2,
	bidirRedundant = 3,
	cdwmGroup = 4,
	rx = 5,
	tx = 6,
	rxRedundant = 7,
	txRedundant = 8
}

export enum GroupRedundency {
	none = 0,
	manualprimary = 1,
	manualbackup = 2,
	auto = 3
}

export enum GroupStatus {
	ok = 1,
	primaryfail = 2,
	backupfail = 3,
	primaryfailbackupactive = 4,
	groupfailure = 5
}

export enum ModuleType {
	unspecified = 0,
	receiver = 5,
	transmitter = 6
}

export enum ModuleStatus {
	none = 0,
	ok = 1,
	fault = 5
}

export enum ModuleStatusLED { 
	off = 0,
	green = 1, 
	red = 2,
	cyan = 3,
	blue = 4,
	redblink = 10,
	blueblink = 12
}

export enum LNAStatus {
	off=0,
	on=1,
	none=4
}

export enum BiasTState {
	off=0,
	on=1,
	alwayson=2,
	autoopla=3,
	none=4
}

export enum MonPlan {
	sleep=0,
	active=1
}

export enum EventLevel {
	critical=0,
	warning=1,
	change=2,
	notify=3,
	system=4
}
