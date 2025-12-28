import "dotenv/config";
import { createApp } from "../src/app";

// Export the Express app as default for Vercel
const app = createApp();
export default app;

