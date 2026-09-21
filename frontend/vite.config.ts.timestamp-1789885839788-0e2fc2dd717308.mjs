// vite.config.ts
import { defineConfig } from "file:///Users/houmingqi/Desktop/my_own/devflow-harness/frontend/node_modules/.pnpm/vite@5.4.11/node_modules/vite/dist/node/index.js";
import react from "file:///Users/houmingqi/Desktop/my_own/devflow-harness/frontend/node_modules/.pnpm/@vitejs+plugin-react@4.3.4_vite@5.4.11/node_modules/@vitejs/plugin-react/dist/index.mjs";
import { codeInspectorPlugin } from "file:///Users/houmingqi/Desktop/my_own/devflow-harness/frontend/node_modules/.pnpm/code-inspector-plugin@2.0.9/node_modules/code-inspector-plugin/dist/index.mjs";
var vite_config_default = defineConfig({
  plugins: [
    codeInspectorPlugin({
      bundler: "vite"
    }),
    react()
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "")
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvaG91bWluZ3FpL0Rlc2t0b3AvbXlfb3duL2RldmZsb3ctaGFybmVzcy9mcm9udGVuZFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL2hvdW1pbmdxaS9EZXNrdG9wL215X293bi9kZXZmbG93LWhhcm5lc3MvZnJvbnRlbmQvdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL2hvdW1pbmdxaS9EZXNrdG9wL215X293bi9kZXZmbG93LWhhcm5lc3MvZnJvbnRlbmQvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJ1xuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0J1xuaW1wb3J0IHsgY29kZUluc3BlY3RvclBsdWdpbiB9IGZyb20gJ2NvZGUtaW5zcGVjdG9yLXBsdWdpbidcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW1xuICAgIGNvZGVJbnNwZWN0b3JQbHVnaW4oe1xuICAgICAgYnVuZGxlcjogJ3ZpdGUnLFxuICAgIH0pLFxuICAgIHJlYWN0KCksXG4gIF0sXG4gIHNlcnZlcjoge1xuICAgIHBvcnQ6IDUxNzMsXG4gICAgcHJveHk6IHtcbiAgICAgICcvYXBpJzoge1xuICAgICAgICB0YXJnZXQ6ICdodHRwOi8vMTI3LjAuMC4xOjgwMDAnLFxuICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXG4gICAgICAgIHJld3JpdGU6IChwYXRoKSA9PiBwYXRoLnJlcGxhY2UoL15cXC9hcGkvLCAnJyksXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG59KVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUEwVixTQUFTLG9CQUFvQjtBQUN2WCxPQUFPLFdBQVc7QUFDbEIsU0FBUywyQkFBMkI7QUFFcEMsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUztBQUFBLElBQ1Asb0JBQW9CO0FBQUEsTUFDbEIsU0FBUztBQUFBLElBQ1gsQ0FBQztBQUFBLElBQ0QsTUFBTTtBQUFBLEVBQ1I7QUFBQSxFQUNBLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxNQUNMLFFBQVE7QUFBQSxRQUNOLFFBQVE7QUFBQSxRQUNSLGNBQWM7QUFBQSxRQUNkLFNBQVMsQ0FBQyxTQUFTLEtBQUssUUFBUSxVQUFVLEVBQUU7QUFBQSxNQUM5QztBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
