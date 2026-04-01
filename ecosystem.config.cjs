module.exports = {
  apps: [{
    name: "pievra-mcp",
    script: "dist/index.js",
    args: "--sse --port 3004",
    cwd: "/var/www/pievra-mcp",
    env: {
      NODE_ENV: "production",
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: "256M",
  }],
};
