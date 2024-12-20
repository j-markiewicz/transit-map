import { useEffect, useState } from "preact/hooks";
import { navigate } from "wouter-preact/use-hash-location";

import add_icon from "../assets/add.svg";
import edit_icon from "../assets/edit.svg";

import Loading from "../components/loading.tsx";
import { IS_DEMO_MODE } from "../util.ts";
import {
	BasicSystemInfo,
	get_all_info,
	is_logged_in,
	log_out,
} from "../api.ts";
import style from "./menu.module.css";

export default function Menu() {
	const [authenticated, setAuthenticated] = useState(false);
	const [info, setInfo] = useState<BasicSystemInfo[] | null>(null);

	useEffect(() => {
		is_logged_in().then((authed) => setAuthenticated(authed));
		get_all_info().then((i) => {
			setInfo(() => i ?? []);
		});
	}, []);

	return (
		<>
			<header class={style.pageheader}>
				<a class={style.pagename} onClick={() => navigate("/")}>
					<img class={style.pageicon} src="icon.svg" alt="transit-map logo" />
					Transit Map
				</a>

				{authenticated ? (
					<button
						class={style.login}
						disabled={IS_DEMO_MODE}
						onClick={() =>
							log_out().then(() =>
								is_logged_in().then((authed) => setAuthenticated(authed))
							)
						}
					>
						Log Out
					</button>
				) : (
					<button
						class={style.login}
						disabled={IS_DEMO_MODE}
						onClick={() => navigate("/login")}
						onMouseEnter={() =>
							is_logged_in().then((authed) => setAuthenticated(authed))
						}
					>
						Log In
					</button>
				)}
			</header>

			{IS_DEMO_MODE ? (
				<p class={style.banner}>
					This website is in demo mode - the data displayed here is not updated,
					configuration is read-only, and authentication is disabled.
				</p>
			) : null}

			<div class={style.wrapper}>
				{info === null ? (
					<Loading />
				) : (
					<>
						{info.map((i) => (
							<section key={i.name} class={style.system}>
								<div class={style.header}>
									<a onClick={() => navigate(`/${i.name}`)} class={style.name}>
										<h1>{i.name}</h1>
									</a>

									<div class={style.buttons}>
										<a
											class={style.buttonwrapper}
											onClick={() => navigate(`/edit/${i.name}`)}
										>
											<img
												class={style.button}
												src={edit_icon}
												alt={`edit ${i.name}`}
											/>
										</a>
									</div>
								</div>

								<div class={style.chips}>
									<span class={style.chip}>
										{fmt_num(i.stops, { one: "stop", other: "stops" })}
									</span>
									<span class={style.chip}>
										{fmt_num(i.lines, { one: "line", other: "lines" })}
									</span>
									<span
										class={i.gtfs_sources === 0 ? style.emptychip : style.chip}
									>
										{i.gtfs_sources === 0
											? "No Schedule"
											: `Schedule ×${i.gtfs_sources}`}
									</span>
									<span
										class={i.rt_sources === 0 ? style.emptychip : style.chip}
									>
										{i.rt_sources === 0
											? "No Realtime"
											: `Realtime ×${i.rt_sources}`}
									</span>
								</div>
							</section>
						))}

						{authenticated ? (
							<section key="add" class={style.system}>
								<div class={style.header}>
									<a onClick={() => navigate("/new")} class={style.name}>
										<img
											class={style.button}
											src={add_icon}
											alt="add new transit system"
											title="Add new transit system configuration"
										/>
									</a>
								</div>
							</section>
						) : null}
					</>
				)}
			</div>
		</>
	);
}

function fmt_num(
	n: number | undefined,
	word: {
		zero?: string;
		one?: string;
		two?: string;
		few?: string;
		many?: string;
		other?: string;
	}
): string {
	const plurals = new Intl.PluralRules("en");

	if (n === undefined || !isFinite(n)) {
		return `??? ${word[plurals.select(1000)]}`;
	} else if (n === 0) {
		return `No ${word[plurals.select(n)]}`;
	} else {
		return `${n} ${word[plurals.select(n)]}`;
	}
}
