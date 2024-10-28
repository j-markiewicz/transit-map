import { render } from "preact";
import { Switch, Route } from "wouter-preact";

import { Edit } from "./edit.tsx";
import { Menu } from "./menu.tsx";
import { Line } from "./line.tsx";
import { Map } from "./map.tsx";
import { Overview } from "./overview.tsx";
import { Stop } from "./stop.tsx";

import "./main.css";

function Main() {
	return (
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
	);
}

render(<Main />, document.getElementById("app")!);
