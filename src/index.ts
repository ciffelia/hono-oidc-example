import { Hono } from "hono";
import { authApp } from "./auth";

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => {
	return c.html(
		'<!doctype html><meta charset="utf-8"><title>Hono OIDC example</title><a href="/auth/sign_in">Sign in</a>',
	);
});

app.route("/", authApp);

export default app;
