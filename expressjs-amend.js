
const express = require('express');

const env_keys = []

for (const key in process.env) {
    if (!key.startsWith("AMEND_")) {
        continue;
    }
    env_keys.push(key);
}

env_keys.sort(new Intl.Collator('en-US', {
    numeric: true,
    sensitivity: 'variant',
    caseFirst: 'upper'
}).compare);

const amend_rules = []

for (const key of env_keys) {
    const error_str = `amend: env var '${key}'='${process.env[key]}' does not match expected syntax IN_PORT OUT_HOST PATH_REGEX JS...`;
    const tokens = process.env[key].split(" ");

    const in_port = Number(tokens[0]);
    if (Number.isNaN(in_port) || !Number.isInteger(in_port)) {
        console.error(error_str);
        process.exit(1);
    }

    const out_host = tokens[1];
    if (out_host === undefined) {
        console.error(error_str);
        process.exit(1);
    }

    const path_regex_token = tokens[2];
    if (path_regex_token === undefined) {
        console.error(error_str);
        process.exit(1);
    }
    let path_regex;
    try {
        path_regex = new RegExp(path_regex_token);
    } catch (err) {
        console.error(`amend: invalid regex pattern '${path_regex_token}'\n`, err);
        process.exit(1);
    }

    const expression = process.env[key].substring(`${tokens[0]} ${tokens[1]} ${tokens[2]} `.length);

    const rule = {
        name:         key,
        in_port:      in_port,
        out_host:     out_host,
        path_regex:   path_regex,
        expression:   expression,
    };
    amend_rules.push(rule);
}

if (amend_rules.length === 0) {
    console.error("amend: no AMEND_ rules found in environment; exiting (try setting AMEND_foo_0 = ... as an environment variable)")
    process.exit(1);
}

function timestamp() {
    return (new Date()).toLocaleString();
}

function proxy_on_port(port, rules) {
    const app = express();
    app.use(express.text({ type: '*/*' }));

    app.use(async (req, res) => {
      try {
          let parsed_body;
          if (req.body) {
              try {
                  parsed_body = JSON.parse(req.body);
              } catch (err) {
                 if (err instanceof SyntaxError) {
                     console.warn(`${timestamp()} request body is not valid JSON; `+
                                  `rules eval will proceed with $ = _ = undefined and the body will be proxied verbatim unless _ is assigned explicitly in a rule`);
                 } else {
                     throw err;
                 }
              }
          }

          const $ = parsed_body;
          const $url = req.url;
          const $method = req.method;
          const $headers = req.headers;

          let _ = req.body && JSON.parse(JSON.stringify(parsed_body));
          let _method = JSON.parse(JSON.stringify(req.method));
          let _headers = JSON.parse(JSON.stringify(req.headers));
          let _url;
          let found_rule = false;

          for (const rule of rules) {
              if (rule.path_regex.test(req.url)) {
                  found_rule = true;
                  _url = rule.out_host + req.url;
                  console.log(`${timestamp()} apply ${rule.name} for inbound ${$method} ${$url}`);
                  try {
                      eval(rule.expression);
                  } catch (err) {
                      console.warn(`${timestamp()} error thrown during ${rule.name} eval; ignoring error\n`, err);
                  }
              }
          }

          if (!found_rule) {
              throw "no rule found for incoming raffic; cannot route";
          }

          console.log(`${timestamp()} ${$method} ${$url} -> ${_method} ${_url}`);

          const output_req_body = _ ? JSON.stringify(_) : req.body

          if (req.headers['content-length'] !== undefined) {
              _headers['content-length'] = output_req_body.length;
          }

          let response;
          try {
              response = await fetch(_url, {
                  method:   _method,
                  headers:  _headers,
                  body:     output_req_body
              });
          } catch (err) {
              console.error(`${timestamp()} failed to obtain response from upstream server; returning HTTP 502\n`, err);
              res.status(502).json({ error: "Failed to fetch result from upstream server (see amend stderr for details)." });
              return;
          }
          res.status(response.status);

          response.headers.forEach((value, key) => {
              res.set(key, value);
          });

          const buffer = await response.arrayBuffer();
          res.send(Buffer.from(buffer));
      } catch (err) {
          console.error(`${timestamp()} amend: responding with HTTP 500 to ${req.method} ${req.url} due to error\n"`, err);
          res.status(500).json({ error: "Error during preprocessing (see amend stderr for details)." });
      }
    });

    app.listen(port, () => {
        const t = timestamp();
        console.log(`${t} started proxy on :${port}`);
        for (const rule of rules) {
            console.log(`${t} ${JSON.stringify(rule)}`)
        }
    });
}

const rules_by_in_port = new Map();

for (const rule of amend_rules) {
    let array = rules_by_in_port.get(rule.in_port);
    if (!array) {
        array = []
        rules_by_in_port.set(rule.in_port, array);
    }
    array.push(rule);
}

for (const [in_port, rules] of rules_by_in_port) {
    proxy_on_port(in_port, rules);
}

