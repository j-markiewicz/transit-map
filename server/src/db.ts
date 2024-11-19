import { Temporal } from "temporal-polyfill";
import Database from "better-sqlite3";

import { hash_password, random } from "./auth.js";
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
		[name in string]?: SystemConfig & { owner: string };
	}>;

	/** get the config for the given system */
	public abstract get_config(
		system: string
	): Promise<(SystemConfig & { owner: string }) | undefined>;

	/** set the config for the given system to the given value, if it exists */
	public abstract set_config(
		system: string,
		config: SystemConfig
	): Promise<undefined>;

	/** add a new system config, but only if it doesn't exist */
	public abstract add_config(
		system: string,
		email: string,
		config: SystemConfig
	): Promise<undefined>;

	/** delete the config for the given system */
	public abstract delete_config(system: string): Promise<undefined>;

	/** get a user's information by their user token */
	public abstract get_user_by_user_token(
		token: string,
		new_expiry?: Temporal.Instant
	): Promise<{ email: string; is_admin: boolean } | undefined>;

	/** set the given user token for the user with the given email address, returning whether such a user exists */
	public abstract set_user_token(
		email: string,
		user_token: string,
		expires: Temporal.Instant
	): Promise<boolean>;

	/** delete the given user token from the database, returning whether it existed */
	public abstract delete_user_token(user_token: string): Promise<boolean>;

	/** get a user's information by their email address */
	public abstract get_user_by_email(email: string): Promise<
		| {
				provider: string | null;
				authenticator: string;
				totp_secret: string | null;
				is_admin: boolean;
		  }
		| undefined
	>;

	/** add a user account */
	public abstract add_user(
		email: string,
		provider: string | null,
		authenticator: string,
		totp_secret: string | null,
		is_admin?: boolean
	): Promise<undefined>;
}

type SQLitePreparedStatements = {
	select_systems: Database.Statement<
		[],
		{
			name: string;
			owner: string;
			lat1: number;
			lon1: number;
			lat2: number;
			lon2: number;
		}
	>;
	select_system: Database.Statement<
		{ name: string },
		{
			name: string;
			owner: string;
			lat1: number;
			lon1: number;
			lat2: number;
			lon2: number;
		}
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
			owner: string;
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
	insert_user: Database.Statement<
		{
			email: string;
			provider: string | null;
			authenticator: string;
			totp_secret: string | null;
			is_admin: number;
		},
		undefined
	>;
	update_user: Database.Statement<
		{
			email: string;
			new_email: string;
			provider: string | null;
			authenticator: string;
			totp_secret: string | null;
		},
		undefined
	>;
	delete_user: Database.Statement<{ email: string }, undefined>;
	select_user_tokens: Database.Statement<
		[],
		{ token: string; expires: string }
	>;
	delete_user_token: Database.Statement<{ token: string }, {}>;
	select_user_token: Database.Statement<
		{ token: string },
		{ email: string; is_admin: boolean }
	>;
	update_user_token: Database.Statement<
		{ token: string; expires: string },
		undefined
	>;
	insert_user_token: Database.Statement<
		{
			user: string;
			token: string;
			expires: string;
		},
		undefined
	>;
	select_user: Database.Statement<
		{ email: string },
		{
			provider: string | null;
			authenticator: string;
			totp_secret: string | null;
			is_admin: boolean;
		}
	>;
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
				"CREATE TABLE IF NOT EXISTS users (\
					email TEXT NOT NULL PRIMARY KEY,\
					provider TEXT,\
					authenticator TEXT NOT NULL,\
					totp_secret TEXT,\
					is_admin BOOLEAN DEFAULT FALSE\
				)"
			);

			db.exec(
				"CREATE TABLE IF NOT EXISTS systems (\
					name TEXT NOT NULL PRIMARY KEY,\
					owner TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE ON UPDATE CASCADE,\
					lat1 DOUBLE PRECISION NOT NULL,\
					lon1 DOUBLE PRECISION NOT NULL,\
					lat2 DOUBLE PRECISION NOT NULL,\
					lon2 DOUBLE PRECISION NOT NULL\
				)"
			);

			db.exec(
				"CREATE TABLE IF NOT EXISTS gtfs_sources (\
					system TEXT NOT NULL REFERENCES systems(name) ON DELETE CASCADE,\
					url TEXT NOT NULL,\
					id TEXT NOT NULL,\
					max_age TEXT NOT NULL,\
					PRIMARY KEY (system, url)\
				)"
			);

			db.exec(
				"CREATE TABLE IF NOT EXISTS rt_sources (\
					system TEXT NOT NULL REFERENCES systems(name) ON DELETE CASCADE,\
					url TEXT NOT NULL,\
					id TEXT NOT NULL,\
					max_age TEXT NOT NULL,\
					PRIMARY KEY (system, url)\
				)"
			);

			db.exec(
				"CREATE TABLE IF NOT EXISTS user_tokens (\
					token TEXT NOT NULL PRIMARY KEY,\
					user TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE ON UPDATE CASCADE,\
					expires TIMESTAMP WITH TIME ZONE NOT NULL\
				)"
			);
		}

		const statements: SQLitePreparedStatements = {
			select_systems: db.prepare(
				"SELECT name, owner, lat1, lon1, lat2, lon2 FROM systems"
			),
			select_system: db.prepare(
				"SELECT name, owner, lat1, lon1, lat2, lon2 FROM systems WHERE name = $name"
			),
			select_gtfs_sources: db.prepare(
				"SELECT url, id, max_age FROM gtfs_sources WHERE system = $system"
			),
			select_rt_sources: db.prepare(
				"SELECT url, id, max_age FROM rt_sources WHERE system = $system"
			),
			insert_system: db.prepare(
				"INSERT INTO systems (name, owner, lat1, lon1, lat2, lon2) VALUES ($name, $owner, $lat1, $lon1, $lat2, $lon2)"
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
			insert_user: db.prepare(
				"INSERT INTO users (email, provider, authenticator, totp_secret, is_admin) VALUES ($email, $provider, $authenticator, $totp_secret, $is_admin)"
			),
			update_user: db.prepare(
				"UPDATE users SET email = $new_email, provider = $provider, authenticator = $authenticator, totp_secret = $totp_secret WHERE email = $email"
			),
			delete_user: db.prepare("DELETE FROM users WHERE email = $email"),
			select_user_tokens: db.prepare("SELECT token, expires FROM user_tokens"),
			delete_user_token: db.prepare(
				"DELETE FROM user_tokens WHERE token = $token"
			),
			update_user_token: db.prepare(
				"UPDATE user_tokens SET expires = $expires WHERE token = $token"
			),
			select_user_token: db.prepare(
				"SELECT email, is_admin FROM users WHERE email = (SELECT user FROM user_tokens WHERE token = $token)"
			),
			insert_user_token: db.prepare(
				"INSERT INTO user_tokens (token, user, expires) VALUES ($token, $user, $expires)"
			),
			select_user: db.prepare(
				"SELECT provider, authenticator, totp_secret, is_admin FROM users WHERE email = $email"
			),
		};

		const sqlitedb = new SQLiteDB(db, statements);

		if (is_new) {
			await add_sample_data(sqlitedb);
		}

		sqlitedb.expire_tokens();

		return sqlitedb;
	}

	public async get_config_all(): Promise<{
		[name in string]?: SystemConfig & { owner: string };
	}> {
		return Object.fromEntries(
			this.statements.select_systems.all().map((sys) => [
				sys.name,
				{
					owner: sys.owner,
					location: [
						[sys.lat1, sys.lon1],
						[sys.lat2, sys.lon2],
					],
					gtfs: Object.fromEntries(
						this.statements.select_gtfs_sources
							.all({ system: sys.name })
							.map((s) => [s.url, { id: s.id, max_age: s.max_age }])
					),
					realtime: Object.fromEntries(
						this.statements.select_rt_sources
							.all({ system: sys.name })
							.map((s) => [s.url, { id: s.id, max_age: s.max_age }])
					),
				},
			])
		);
	}

	public async get_config(
		system: string
	): Promise<(SystemConfig & { owner: string }) | undefined> {
		const sys = this.statements.select_system.get({ name: system });

		if (sys === undefined) {
			return undefined;
		}

		return {
			owner: sys.owner,
			location: [
				[sys.lat1, sys.lon1],
				[sys.lat2, sys.lon2],
			],
			gtfs: Object.fromEntries(
				this.statements.select_gtfs_sources
					.all({ system: sys.name })
					.map((s) => [s.url, { id: s.id, max_age: s.max_age }])
			),
			realtime: Object.fromEntries(
				this.statements.select_rt_sources
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
			this.statements.update_system.run({
				name: system,
				lat1: config.location[0][0],
				lon1: config.location[0][1],
				lat2: config.location[1][0],
				lon2: config.location[1][1],
			});

			this.statements.delete_gtfs_sources.run({ system });
			this.statements.delete_rt_sources.run({ system });

			Object.entries(config.gtfs).forEach(([url, c]) => {
				this.statements.insert_gtfs_source.run({ system, url, ...c! });
			});

			Object.entries(config.realtime).forEach(([url, c]) => {
				this.statements.insert_rt_source.run({ system, url, ...c! });
			});
		})();
	}

	public async add_config(
		system: string,
		owner: string,
		config: SystemConfig
	): Promise<undefined> {
		this.db.transaction(() => {
			this.statements.insert_system.run({
				name: system,
				owner,
				lat1: config.location[0][0],
				lon1: config.location[0][1],
				lat2: config.location[1][0],
				lon2: config.location[1][1],
			});

			Object.entries(config.gtfs)
				.filter(([_, c]) => c !== undefined)
				.forEach(([url, c]) => {
					this.statements.insert_gtfs_source.run({ system, url, ...c! });
				});

			Object.entries(config.realtime)
				.filter(([_, c]) => c !== undefined)
				.forEach(([url, c]) => {
					this.statements.insert_rt_source.run({ system, url, ...c! });
				});
		})();
	}

	public async delete_config(system: string): Promise<undefined> {
		this.db.transaction(() => {
			this.statements.delete_gtfs_sources.run({ system });
			this.statements.delete_rt_sources.run({ system });
			this.statements.delete_system.run({
				name: system,
			});
		})();
	}

	public async get_user_by_user_token(
		token: string,
		new_expiry?: Temporal.Instant
	): Promise<{ email: string; is_admin: boolean } | undefined> {
		this.expire_tokens();

		try {
			if (new_expiry !== undefined) {
				this.statements.update_user_token.run({
					token,
					expires: new_expiry.toString(),
				});
			}
		} catch (e: unknown) {}

		const res = this.statements.select_user_token.get({
			token,
		});

		return res === undefined
			? undefined
			: { email: res.email, is_admin: !!res.is_admin };
	}

	public async get_user_by_email(email: string): Promise<
		| {
				provider: string | null;
				authenticator: string;
				totp_secret: string | null;
				is_admin: boolean;
		  }
		| undefined
	> {
		const res = this.statements.select_user.get({ email });

		return res === undefined
			? undefined
			: {
					provider: res.provider,
					authenticator: res.authenticator,
					totp_secret: res.totp_secret,
					is_admin: !!res.is_admin,
			  };
	}

	public async set_user_token(
		email: string,
		user_token: string,
		expires: Temporal.Instant
	): Promise<boolean> {
		return this.db.transaction(() => {
			const user = this.statements.select_user.get({ email });

			if (user === undefined) {
				return false;
			}

			this.statements.insert_user_token.run({
				user: email,
				token: user_token,
				expires: expires.toString(),
			});

			return true;
		})();
	}

	public async delete_user_token(user_token: string): Promise<boolean> {
		return (
			this.statements.delete_user_token.run({ token: user_token }).changes > 0
		);
	}

	public async add_user(
		email: string,
		provider: string | null,
		authenticator: string,
		totp_secret: string | null,
		is_admin: boolean = false
	): Promise<undefined> {
		this.statements.insert_user.run({
			email,
			provider,
			authenticator,
			totp_secret,
			is_admin: is_admin ? 1 : 0,
		});
	}

	private expire_tokens() {
		this.db.transaction(() => {
			for (const {
				token,
				expires,
			} of this.statements.select_user_tokens.all()) {
				if (
					Temporal.Instant.from(expires)
						.since(Temporal.Now.instant())
						.total("nanoseconds") < 0
				) {
					this.statements.delete_user_token.run({ token });
				}
			}
		})();
	}
}

/** add sample data to the given database, if that is not disabled with "--no-insert-sample-data" */
async function add_sample_data(db: DB) {
	if (process.argv.includes("--no-insert-sample-data")) {
		return;
	}

	console.info(
		"Inserting sample data into the newly created database (use `--no-insert-sample-data` to disable)"
	);

	const admin_email = "admin@transit.map";
	let admin_password = process.env.DEFAULT_ADMIN_PASSWORD || undefined;

	if (admin_password === undefined) {
		console.warn(
			"Creating new database with sample data, but no default admin password specified using the `DEFAULT_ADMIN_PASSWORD` env var."
		);

		admin_password = await random();
		if (!process.argv.includes("--no-print-generated-admin-password")) {
			console.warn(
				`Generated admin password for account "${admin_email}" (to disable printing this, use "--no-print-generated-admin-password"): "${admin_password}"`
			);
		}
	}

	const hashed_admin_password = await hash_password(admin_password, true);
	admin_password = undefined;

	db.add_user(admin_email, null, hashed_admin_password, null, true);

	db.add_config("Kraków", admin_email, {
		location: [
			[50.1233, 19.7575],
			[49.9628, 20.1764],
		],
		gtfs: {
			"https://gtfs.ztp.krakow.pl/GTFS_KRK_T.zip": {
				id: "t",
				max_age: "1d",
			},
			"https://gtfs.ztp.krakow.pl/GTFS_KRK_A.zip": {
				id: "a",
				max_age: "1d",
			},
		},
		realtime: {
			"https://gtfs.ztp.krakow.pl/VehiclePositions_T.pb": {
				id: "t",
				max_age: "20s",
			},
			"https://gtfs.ztp.krakow.pl/VehiclePositions_A.pb": {
				id: "a",
				max_age: "20s",
			},
			"https://gtfs.ztp.krakow.pl/TripUpdates_T.pb": {
				id: "t",
				max_age: "20s",
			},
			"https://gtfs.ztp.krakow.pl/TripUpdates_A.pb": {
				id: "a",
				max_age: "20s",
			},
			"https://gtfs.ztp.krakow.pl/ServiceAlerts_T.pb": {
				id: "t",
				max_age: "5m",
			},
			"https://gtfs.ztp.krakow.pl/ServiceAlerts_A.pb": {
				id: "a",
				max_age: "5m",
			},
		},
	});

	db.add_config("Koleje Małopolskie", admin_email, {
		location: [
			[50.6, 21.5],
			[49.45, 19],
		],
		gtfs: {
			"https://kolejemalopolskie.com.pl/rozklady_jazdy/kml-ska-gtfs.zip": {
				id: "ska",
				max_age: "1d",
			},
			"https://kolejemalopolskie.com.pl/rozklady_jazdy/ald-gtfs.zip": {
				id: "bus",
				max_age: "1d",
			},
		},
		realtime: {},
	});
}
