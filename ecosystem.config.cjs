module.exports = {
  apps: [{
    name: "pievra-mcp",
    script: "dist/index.js",
    args: "--sse --port 3004",
    cwd: "/var/www/pievra-mcp",
    env: {
      NODE_ENV: "production",
      // The Supply Atlas API runs on this host; outside it the tools use the public address.
      PIEVRA_SUPPLY_API: "http://127.0.0.1:3011",
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: "256M",
  }],
};
