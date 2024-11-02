import { render } from "preact";
import { Switch, Route, Router } from "wouter-preact";
import { useHashLocation } from "wouter-preact/use-hash-location";

import Edit from "./pages/edit.tsx";
import Menu from "./pages/menu.tsx";
import Line from "./sidebars/line.tsx";
import Map from "./pages/map.tsx";
import Overview from "./sidebars/overview.tsx";
import Stop from "./sidebars/stop.tsx";

import "./main.css";

function Main() {
	return (
		<Router hook={useHashLocation}>
			<Switch>
				<Route path="/">
					<Menu />
				</Route>
				<Route path="/new">
					<Edit />
				</Route>
				<Route path="/:system/edit">
					{({ system }) => <Edit system={system} />}
				</Route>
				<Route path="/:system" nest>
					{({ system }) => (
						<Map system={system}>
							<Switch>
								<Route path="/line/:id">
									{({ id }) => <Line system={system} id={id} />}
								</Route>
								<Route path="/stop/:id">
									{({ id }) => <Stop system={system} id={id} />}
								</Route>
								<Route>
									<Overview system={system} />
								</Route>
							</Switch>
						</Map>
					)}
				</Route>
			</Switch>
		</Router>
	);
}

render(<Main />, document.getElementById("app")!);
