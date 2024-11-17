import Database from "better-sqlite3";

import { SystemConfig } from "./types.js";

export default abstract class DB {
	/** create a new DB using the given `uri` */
	static async new(uri: URL): Promise<DB> {
		switch (uri.protocol) {
			case "sqlite:":
				return SQLiteDB._new(uri.pathname);
			default:
				throw new Error("unrecognized database protocol");
		}
	}

	/** get the config for all systems in the database */
	public abstract get_config_all(): Promise<{
		[name in string]?: SystemConfig;
	}>;

	/** get the config for the given system */
	public abstract get_config(system: string): Promise<SystemConfig | undefined>;

	/** set the config for the given system to the given value, if it exists */
	public abstract set_config(
		system: string,
		config: SystemConfig
	): Promise<undefined>;

	/** add a new system config, but only if it doesn't exist */
	public abstract add_config(
		system: string,
		config: SystemConfig
	): Promise<undefined>;

	/** delete the config for the given system */
	public abstract delete_config(system: string): Promise<undefined>;
}

type SQLitePreparedStatements = {
	config: {
		select_systems: Database.Statement<
			[],
			{ name: string; lat1: number; lon1: number; lat2: number; lon2: number }
		>;
		select_system: Database.Statement<
			{ name: string },
			{ name: string; lat1: number; lon1: number; lat2: number; lon2: number }
		>;
		select_gtfs_sources: Database.Statement<
			{ system: string },
			{ url: string; id: string; max_age: string }
		>;
		select_rt_sources: Database.Statement<
			{ system: string },
			{ url: string; id: string; max_age: string }
		>;
		insert_system: Database.Statement<
			{
				name: string;
				lat1: number;
				lon1: number;
				lat2: number;
				lon2: number;
			},
			undefined
		>;
		update_system: Database.Statement<
			{
				name: string;
				lat1: number;
				lon1: number;
				lat2: number;
				lon2: number;
			},
			undefined
		>;
		delete_system: Database.Statement<{ name: string }, undefined>;
		insert_gtfs_source: Database.Statement<
			{
				system: string;
				url: string;
				max_age: string;
				id: string;
			},
			undefined
		>;
		delete_gtfs_sources: Database.Statement<{ system: string }, undefined>;
		insert_rt_source: Database.Statement<
			{
				system: string;
				url: string;
				max_age: string;
				id: string;
			},
			undefined
		>;
		delete_rt_sources: Database.Statement<{ system: string }, undefined>;
	};
};

class SQLiteDB extends DB {
	private db: Database.Database;
	private statements: SQLitePreparedStatements;

	private constructor(
		db: Database.Database,
		statements: SQLitePreparedStatements
	) {
		super();

		this.db = db;
		this.statements = statements;
	}

	/** create a new SQLiteDB with the given `name` */
	static async _new(name: string): Promise<DB> {
		const db = new Database(name);

		let is_new = false;
		try {
			db.exec("SELECT 1 FROM systems");
		} catch (e: unknown) {
			is_new = true;
		}

		if (is_new) {
			db.exec(
				"CREATE TABLE IF NOT EXISTS systems (\
					name TEXT PRIMARY KEY NOT NULL,\
					lat1 DOUBLE PRECISION NOT NULL,\
					lon1 DOUBLE PRECISION NOT NULL,\
					lat2 DOUBLE PRECISION NOT NULL,\
					lon2 DOUBLE PRECISION NOT NULL\
				)"
			);

			db.exec(
				"CREATE TABLE IF NOT EXISTS gtfs_sources (\
					system TEXT NOT NULL REFERENCES systems(name),\
					url TEXT NOT NULL,\
					id TEXT NOT NULL,\
					max_age TEXT NOT NULL,\
					PRIMARY KEY (system, url)\
				)"
			);

			db.exec(
				"CREATE TABLE IF NOT EXISTS rt_sources (\
					system TEXT NOT NULL REFERENCES systems(name),\
					url TEXT NOT NULL,\
					id TEXT NOT NULL,\
					max_age TEXT NOT NULL,\
					PRIMARY KEY (system, url)\
				)"
			);
		}

		const statements: SQLitePreparedStatements = {
			config: {
				select_systems: db.prepare(
					"SELECT name, lat1, lon1, lat2, lon2 FROM systems"
				),
				select_system: db.prepare(
					"SELECT name, lat1, lon1, lat2, lon2 FROM systems WHERE name = $name"
				),
				select_gtfs_sources: db.prepare(
					"SELECT url, id, max_age FROM gtfs_sources WHERE system = $system"
				),
				select_rt_sources: db.prepare(
					"SELECT url, id, max_age FROM rt_sources WHERE system = $system"
				),
				insert_system: db.prepare(
					"INSERT INTO systems (name, lat1, lon1, lat2, lon2) VALUES ($name, $lat1, $lon1, $lat2, $lon2)"
				),
				update_system: db.prepare(
					"UPDATE systems SET lat1 = $lat1, lon1 = $lon1, lat2 = $lat2, lon2 = $lon2 WHERE name = $name"
				),
				delete_system: db.prepare("DELETE FROM systems WHERE name = $name"),
				insert_gtfs_source: db.prepare(
					"INSERT INTO gtfs_sources (system, url, id, max_age) VALUES ($system, $url, $id, $max_age)"
				),
				delete_gtfs_sources: db.prepare(
					"DELETE FROM gtfs_sources WHERE system = $system"
				),
				insert_rt_source: db.prepare(
					"INSERT INTO rt_sources (system, url, id, max_age) VALUES ($system, $url, $id, $max_age)"
				),
				delete_rt_sources: db.prepare(
					"DELETE FROM rt_sources WHERE system = $system"
				),
			},
		};

		if (is_new && !process.argv.includes("--no-insert-sample-data")) {
			console.info(
				"Inserting sample data into the newly created database (use `--no-insert-sample-data` to disable)"
			);

			statements.config.insert_system.run({
				name: "Kraków",
				lat1: 50.1233,
				lon1: 19.7575,
				lat2: 49.9628,
				lon2: 20.1764,
			});

			statements.config.insert_gtfs_source.run({
				system: "Kraków",
				url: "https://gtfs.ztp.krakow.pl/GTFS_KRK_T.zip",
				id: "t",
				max_age: "1d",
			});

			statements.config.insert_gtfs_source.run({
				system: "Kraków",
				url: "https://gtfs.ztp.krakow.pl/GTFS_KRK_A.zip",
				id: "a",
				max_age: "1d",
			});

			statements.config.insert_rt_source.run({
				system: "Kraków",
				url: "https://gtfs.ztp.krakow.pl/VehiclePositions_T.pb",
				id: "t",
				max_age: "20s",
			});

			statements.config.insert_rt_source.run({
				system: "Kraków",
				url: "https://gtfs.ztp.krakow.pl/VehiclePositions_A.pb",
				id: "a",
				max_age: "20s",
			});

			statements.config.insert_rt_source.run({
				system: "Kraków",
				url: "https://gtfs.ztp.krakow.pl/TripUpdates_T.pb",
				id: "t",
				max_age: "20s",
			});

			statements.config.insert_rt_source.run({
				system: "Kraków",
				url: "https://gtfs.ztp.krakow.pl/TripUpdates_A.pb",
				id: "a",
				max_age: "20s",
			});

			statements.config.insert_rt_source.run({
				system: "Kraków",
				url: "https://gtfs.ztp.krakow.pl/ServiceAlerts_T.pb",
				id: "t",
				max_age: "5m",
			});

			statements.config.insert_rt_source.run({
				system: "Kraków",
				url: "https://gtfs.ztp.krakow.pl/ServiceAlerts_A.pb",
				id: "a",
				max_age: "5m",
			});

			statements.config.insert_system.run({
				name: "Koleje Małopolskie",
				lat1: 50.6,
				lon1: 21.5,
				lat2: 49.45,
				lon2: 19.0,
			});

			statements.config.insert_gtfs_source.run({
				system: "Koleje Małopolskie",
				url: "https://kolejemalopolskie.com.pl/rozklady_jazdy/kml-ska-gtfs.zip",
				id: "ska",
				max_age: "1d",
			});

			statements.config.insert_gtfs_source.run({
				system: "Koleje Małopolskie",
				url: "https://kolejemalopolskie.com.pl/rozklady_jazdy/ald-gtfs.zip",
				id: "ald",
				max_age: "1d",
			});
		}

		return new SQLiteDB(db, statements);
	}

	public async get_config_all(): Promise<{ [name in string]?: SystemConfig }> {
		return Object.fromEntries(
			this.statements.config.select_systems.all().map((sys) => [
				sys.name,
				{
					location: [
						[sys.lat1, sys.lon1],
						[sys.lat2, sys.lon2],
					],
					gtfs: Object.fromEntries(
						this.statements.config.select_gtfs_sources
							.all({ system: sys.name })
							.map((s) => [s.url, { id: s.id, max_age: s.max_age }])
					),
					realtime: Object.fromEntries(
						this.statements.config.select_rt_sources
							.all({ system: sys.name })
							.map((s) => [s.url, { id: s.id, max_age: s.max_age }])
					),
				},
			])
		);
	}

	public async get_config(system: string): Promise<SystemConfig | undefined> {
		const sys = this.statements.config.select_system.get({ name: system });

		if (sys === undefined) {
			return undefined;
		}

		return {
			location: [
				[sys.lat1, sys.lon1],
				[sys.lat2, sys.lon2],
			],
			gtfs: Object.fromEntries(
				this.statements.config.select_gtfs_sources
					.all({ system: sys.name })
					.map((s) => [s.url, { id: s.id, max_age: s.max_age }])
			),
			realtime: Object.fromEntries(
				this.statements.config.select_rt_sources
					.all({ system: sys.name })
					.map((s) => [s.url, { id: s.id, max_age: s.max_age }])
			),
		};
	}

	public async set_config(
		system: string,
		config: SystemConfig
	): Promise<undefined> {
		this.db.transaction(() => {
			this.statements.config.update_system.run({
				name: system,
				lat1: config.location[0][0],
				lon1: config.location[0][1],
				lat2: config.location[1][0],
				lon2: config.location[1][1],
			});

			this.statements.config.delete_gtfs_sources.run({ system });
			this.statements.config.delete_rt_sources.run({ system });

			Object.entries(config.gtfs).forEach(([url, c]) => {
				this.statements.config.insert_gtfs_source.run({ system, url, ...c! });
			});

			Object.entries(config.realtime).forEach(([url, c]) => {
				this.statements.config.insert_rt_source.run({ system, url, ...c! });
			});
		})();
	}

	public async add_config(
		system: string,
		config: SystemConfig
	): Promise<undefined> {
		this.db.transaction(() => {
			this.statements.config.insert_system.run({
				name: system,
				lat1: config.location[0][0],
				lon1: config.location[0][1],
				lat2: config.location[1][0],
				lon2: config.location[1][1],
			});

			Object.entries(config.gtfs)
				.filter(([_, c]) => c !== undefined)
				.forEach(([url, c]) => {
					this.statements.config.insert_gtfs_source.run({ system, url, ...c! });
				});

			Object.entries(config.realtime)
				.filter(([_, c]) => c !== undefined)
				.forEach(([url, c]) => {
					this.statements.config.insert_rt_source.run({ system, url, ...c! });
				});
		})();
	}

	public async delete_config(system: string): Promise<undefined> {
		this.db.transaction(() => {
			this.statements.config.delete_gtfs_sources.run({ system });
			this.statements.config.delete_rt_sources.run({ system });
			this.statements.config.delete_system.run({
				name: system,
			});
		})();
	}
}
