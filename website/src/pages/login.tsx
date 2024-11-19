import { navigate } from "wouter-preact/use-hash-location";
import { useState } from "preact/hooks";

import { log_in } from "../api";
import style from "./login.module.css";

export default function LogIn() {
	const [error, setError] = useState(false);
	const [credentials, setCredentials] = useState({ email: "", password: "" });

	return (
		<>
			<header class={style.pageheader}>
				<a class={style.pagename} onClick={() => navigate("/")}>
					<img class={style.pageicon} src="icon.svg" alt="transit-map logo" />
					Transit Map
				</a>

				<button
					class={style.signup}
					onClick={() => navigate("/signup")}
					disabled
					title="Currently not accepting new accounts"
				>
					Sign Up
				</button>
			</header>

			<form
				class={style.wrapper}
				onSubmit={(ev) => {
					ev.preventDefault();
					log_in(credentials).then(
						(success) => {
							if (success) {
								navigate("/");
							} else {
								setError(true);
							}
						},
						() => setError(true)
					);
				}}
			>
				{error ? (
					<p class={style.error}>
						Error logging in, check spelling and try again.
					</p>
				) : null}

				<label class={style.email}>
					<h2 class={style.label}>Email Address</h2>
					<input
						type="email"
						class={style.input}
						value={credentials.email}
						onInput={(ev) =>
							setCredentials((cr) => ({ ...cr, email: ev.currentTarget.value }))
						}
						placeholder="email"
					/>
				</label>

				<label class={style.password}>
					<h2 class={style.label}>Password</h2>
					<input
						type="password"
						class={style.input}
						value={credentials.password}
						onInput={(ev) =>
							setCredentials((cr) => ({
								...cr,
								password: ev.currentTarget.value,
							}))
						}
						placeholder="password"
					/>
				</label>

				<div class={style.buttons}>
					<button
						type="button"
						class={style.button}
						title="Go back"
						onClick={() => navigate("/")}
					>
						Back
					</button>

					<button type="submit" class={style.button} title="Log In">
						Log In
					</button>
				</div>
			</form>
		</>
	);
}
