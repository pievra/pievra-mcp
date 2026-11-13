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
      // nginx serves this server at pievra.com/mcp/, so clients must post to /mcp/message.
      MCP_PUBLIC_MESSAGE_PATH: "/mcp/message",
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: "256M",
  }],
};
