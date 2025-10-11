import { DataItem } from "@dha-team/arbundles/node";
import { Buffer } from "node:buffer";
import { exec } from "node:child_process";
import http from "node:http";

/**
 * Creates a DataItemSigner compatible with @permaweb/aoconnect
 * Similar to aoconnect's createDataItemSigner but uses browser wallet
 */
export function createDataItemSigner(browserSigner: BrowserWalletSigner) {
  return browserSigner.getSigner();
}

interface SigningResponse {
  id: string;
  result?: any;
  error?: string;
}

/**
 * Creates a signer that delegates signing to a browser wallet via a local web server
 */
export class BrowserWalletSigner {
  private server: http.Server | null = null;
  private port: number = 0;
  private pendingRequests: Map<
    string,
    { resolve: (value: any) => void; reject: (error: Error) => void }
  > = new Map();
  private address: string | null = null;

  /**
   * Start the local server and open browser
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      // Listen on a random available port
      this.server.listen(0, "127.0.0.1", () => {
        const addr = this.server!.address() as any;
        this.port = addr.port;
        console.log(
          `\n🌐 Browser wallet signer started at http://localhost:${this.port}`
        );
        console.log("📱 Opening browser for wallet connection...\n");

        // Open browser
        this.openBrowser(`http://localhost:${this.port}`);
        resolve();
      });

      this.server.on("error", reject);
    });
  }

  /**
   * Handle HTTP requests from browser
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    // Enable CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/") {
      // Serve the HTML page
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(this.getSignerHTML());
      return;
    }

    if (req.method === "POST" && req.url === "/poll") {
      // Long polling endpoint for getting signing requests
      // Return pending request if any, otherwise wait
      console.log(
        `📍 /poll called, pendingRequests size: ${this.pendingRequests.size}`
      );
      const request = Array.from(this.pendingRequests.entries())[0];
      if (request) {
        const [id, value] = request;
        console.log(`📍 Found pending request: ${id}`);
        const requestData = (value as any).data;
        if (requestData) {
          console.log(`📍 Request has data, type: ${requestData.type}`);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              id,
              type: requestData.type,
              data: requestData
            })
          );
        } else {
          // No data yet, wait
          setTimeout(() => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ id: null }));
          }, 1000);
        }
      } else {
        // No pending requests, hold connection briefly
        setTimeout(() => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ id: null }));
        }, 1000);
      }
      return;
    }

    if (req.method === "POST" && req.url === "/response") {
      // Browser sends back signed data
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        try {
          const response: SigningResponse = JSON.parse(body);
          const pending = this.pendingRequests.get(response.id);
          if (pending) {
            if (response.error) {
              pending.reject(new Error(response.error));
            } else {
              pending.resolve(response.result);
            }
            this.pendingRequests.delete(response.id);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        } catch (error: any) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: error.message }));
        }
      });
      return;
    }

    if (req.method === "POST" && req.url === "/get-request") {
      // Get the next pending request
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        try {
          const { id } = JSON.parse(body);
          const pending = this.pendingRequests.get(id) as any;
          if (pending && pending.data) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(pending.data));
          } else {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Request not found" }));
          }
        } catch (error: any) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: error.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  }

  /**
   * Get wallet address from browser
   */
  async getAddress(): Promise<string> {
    if (this.address) {
      return this.address;
    }

    const id = this.generateId();
    return new Promise((resolve, reject) => {
      // Set timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error("Timeout waiting for wallet address"));
      }, 60000); // 60 second timeout

      // Store request with both callbacks and data
      this.pendingRequests.set(id, {
        resolve: (value: string) => {
          clearTimeout(timeout);
          this.address = value;
          resolve(value);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
        data: {
          type: "address"
        }
      } as any);
    });
  }

  /**
   * Get the browser wallet signer (for direct use)
   */
  getSigner() {
    return this.createBrowserDataItemSigner();
  }

  /**
   * Create a DataItemSigner compatible with @permaweb/aoconnect
   * This delegates to browser wallet's signDataItem method
   * Uses arbundles DataItem class for proper ANS-104 handling
   */
  private createBrowserDataItemSigner() {
    return async (create: any) => {
      const { data, tags, target, anchor } = await create({
        alg: "rsa-v1_5-sha256",
        passthrough: true
      });

      const requestId = this.generateId();

      return new Promise((resolve, reject) => {
        // Prepare data item params for browser
        const params = {
          data:
            typeof data === "string"
              ? data
              : Buffer.from(data).toString("base64"),
          tags: tags || [],
          target: target || undefined,
          anchor: anchor || undefined
        };

        // Set timeout
        const timeout = setTimeout(() => {
          this.pendingRequests.delete(requestId);
          reject(new Error("Timeout waiting for data item signature"));
        }, 120000); // 120 second timeout

        // Store request with both callbacks and data
        this.pendingRequests.set(requestId, {
          resolve: async (value: { signedDataItem: string }) => {
            clearTimeout(timeout);
            // value should be { signedDataItem: base64String }
            // Convert the signed data item back to proper format
            const signedBuffer = Buffer.from(value.signedDataItem, "base64");

            // Use arbundles DataItem to properly parse the signed data item
            // This handles ID calculation and raw data extraction correctly
            const dataItem = new DataItem(signedBuffer);
            const itemId = await dataItem.id;
            const rawBuffer = await dataItem.getRaw();

            // Convert to Uint8Array as expected by aoconnect
            const raw = new Uint8Array(rawBuffer);

            resolve({
              id: itemId,
              raw: raw
            });
          },
          reject: (err: Error) => {
            clearTimeout(timeout);
            reject(err);
          },
          data: {
            type: "signDataItem",
            params
          }
        } as any);
      });
    };
  }

  /**
   * Notify browser that deployment is complete
   */
  private deploymentComplete = false;

  /**
   * Mark deployment as complete and notify browser
   */
  markComplete(): void {
    this.deploymentComplete = true;
    console.log("\n✅ Deployment complete, notifying browser...");
  }

  /**
   * Cleanup and close server
   */
  async close(): Promise<void> {
    this.markComplete();

    // Give browser time to receive completion message
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          console.log("✅ Browser wallet signer closed");
          resolve();
        });
      });
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private openBrowser(url: string) {
    const platform = process.platform;
    let command: string;

    switch (platform) {
      case "darwin":
        command = `open "${url}"`;
        break;
      case "win32":
        command = `start "${url}"`;
        break;
      default:
        command = `xdg-open "${url}"`;
        break;
    }

    exec(command, (error) => {
      if (error) {
        console.error("Failed to open browser automatically:", error.message);
        console.log(`Please open this URL manually: ${url}`);
      }
    });
  }

  private getSignerHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AO Deploy - Browser Wallet Signer</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 500px;
            width: 100%;
            padding: 40px;
            text-align: center;
        }

        h1 {
            font-size: 28px;
            margin-bottom: 10px;
            color: #333;
        }

        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 14px;
        }

        .status {
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 20px;
            font-weight: 500;
        }

        .status.connecting {
            background: #fff3cd;
            color: #856404;
        }

        .status.connected {
            background: #d4edda;
            color: #155724;
        }

        .status.error {
            background: #f8d7da;
            color: #721c24;
        }

        .status.signing {
            background: #d1ecf1;
            color: #0c5460;
        }

        .wallet-address {
            background: #f8f9fa;
            padding: 10px;
            border-radius: 8px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            word-break: break-all;
            margin-top: 10px;
            color: #333;
        }

        button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 12px 30px;
            border-radius: 25px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
            margin-top: 20px;
        }

        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
        }

        button:active {
            transform: translateY(0);
        }

        button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }

        .spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #667eea;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .log {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 15px;
            margin-top: 20px;
            max-height: 200px;
            overflow-y: auto;
            text-align: left;
            font-size: 12px;
            font-family: 'Courier New', monospace;
        }

        .log-entry {
            padding: 5px 0;
            color: #666;
            border-bottom: 1px solid #e9ecef;
        }

        .log-entry:last-child {
            border-bottom: none;
        }

        .log-entry.success {
            color: #28a745;
        }

        .log-entry.error {
            color: #dc3545;
        }

        .instructions {
            background: #e7f3ff;
            border-left: 4px solid #2196F3;
            padding: 15px;
            margin: 20px 0;
            text-align: left;
            border-radius: 5px;
            font-size: 14px;
            color: #333;
        }

        .instructions strong {
            color: #2196F3;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔐 AO Deploy Wallet Signer</h1>
        <p class="subtitle">Sign transactions with your Arweave wallet</p>

        <div id="status" class="status connecting">
            <div class="spinner"></div>
            Connecting to wallet...
        </div>

        <div id="walletInfo" style="display: none;">
            <div class="wallet-address" id="address"></div>
        </div>

        <div class="instructions">
            <strong>📋 Instructions:</strong><br>
            1. Make sure you have Wander or ArConnect installed<br>
            2. Click "Connect Wallet" below<br>
            3. Approve the connection in your wallet<br>
            4. Keep this window open during deployment
        </div>

        <button id="connectBtn" onclick="connectWallet()">Connect Wallet</button>

        <div class="log" id="log"></div>
    </div>

    <script>
        let connected = false;
        let walletAddress = null;
        let polling = false;

        function log(message, type = 'info') {
            const logDiv = document.getElementById('log');
            const entry = document.createElement('div');
            entry.className = 'log-entry ' + type;
            entry.textContent = new Date().toLocaleTimeString() + ' - ' + message;
            logDiv.appendChild(entry);
            logDiv.scrollTop = logDiv.scrollHeight;
        }

        async function connectWallet() {
            const statusDiv = document.getElementById('status');
            const connectBtn = document.getElementById('connectBtn');

            try {
                if (!window.arweaveWallet) {
                    statusDiv.className = 'status error';
                    statusDiv.innerHTML = '❌ No Arweave wallet found. Please install Wander or ArConnect.';
                    log('No wallet extension found', 'error');
                    return;
                }

                log('Requesting wallet connection...');
                // Request permissions: ACCESS_ADDRESS and SIGN_TRANSACTION for signDataItem
                await window.arweaveWallet.connect([
                    'ACCESS_ADDRESS',
                    'SIGN_TRANSACTION'
                ]);

                walletAddress = await window.arweaveWallet.getActiveAddress();
                
                statusDiv.className = 'status connected';
                statusDiv.innerHTML = '✅ Wallet connected successfully!';
                
                document.getElementById('walletInfo').style.display = 'block';
                document.getElementById('address').textContent = walletAddress;
                
                connectBtn.style.display = 'none';
                
                log('Connected: ' + walletAddress, 'success');
                
                connected = true;
                
                // Start polling for signing requests
                startPolling();
                
            } catch (error) {
                statusDiv.className = 'status error';
                statusDiv.innerHTML = '❌ Failed to connect: ' + error.message;
                log('Connection failed: ' + error.message, 'error');
            }
        }

        async function startPolling() {
            if (polling) return;
            polling = true;
            log('Started listening for signing requests...');

            while (connected) {
                try {
                    const response = await fetch('/poll', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });

                    const request = await response.json();

                    // Check if deployment is complete
                    if (request.completed) {
                        log('✅ Deployment complete!', 'success');
                        document.getElementById('status').className = 'status connected';
                        document.getElementById('status').innerHTML = '✅ Deployment complete! You can close this window.';
                        connected = false; // Stop polling
                        break;
                    }

                    if (request.id && request.type) {
                        await handleRequest(request);
                    }

                    // Small delay before next poll
                    await new Promise(resolve => setTimeout(resolve, 100));

                } catch (error) {
                    console.error('Polling error:', error);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }

        async function handleRequest(request) {
            const statusDiv = document.getElementById('status');

            try {
                if (request.type === 'address') {
                    log('Providing wallet address...');
                    await sendResponse(request.id, walletAddress);
                    log('Address sent successfully', 'success');
                } else if (request.type === 'signDataItem') {
                    statusDiv.className = 'status signing';
                    statusDiv.innerHTML = '✍️ Please sign the data item in your wallet...';
                    log('Data item signing request received, please check your wallet...');

                    // Get the full request data
                    const dataResponse = await fetch('/get-request', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: request.id })
                    });
                    const requestData = await dataResponse.json();
                    const params = requestData.params;

                    // Convert base64 data to Uint8Array if needed
                    let dataToSign = params.data;
                    if (typeof dataToSign === 'string') {
                        try {
                            const binaryString = atob(dataToSign);
                            const bytes = new Uint8Array(binaryString.length);
                            for (let i = 0; i < binaryString.length; i++) {
                                bytes[i] = binaryString.charCodeAt(i);
                            }
                            dataToSign = bytes;
                        } catch (e) {
                            // If it's not base64, keep as string
                        }
                    }

                    // Sign data item with wallet using ArweaveWalletConnector interface
                    const signedDataItem = await window.arweaveWallet.signDataItem({
                        data: dataToSign,
                        tags: params.tags || [],
                        target: params.target,
                        anchor: params.anchor
                    });

                    // Convert ArrayBuffer to base64 for transfer
                    const signedArray = new Uint8Array(signedDataItem);
                    let binary = '';
                    for (let i = 0; i < signedArray.length; i++) {
                        binary += String.fromCharCode(signedArray[i]);
                    }
                    const signedBase64 = btoa(binary);

                    await sendResponse(request.id, {
                        signedDataItem: signedBase64
                    });

                    statusDiv.className = 'status connected';
                    statusDiv.innerHTML = '✅ Wallet connected - Ready for signing';
                    log('Data item signed successfully!', 'success');
                }
            } catch (error) {
                statusDiv.className = 'status error';
                statusDiv.innerHTML = '❌ Signing failed: ' + error.message;
                log('Error: ' + error.message, 'error');
                await sendResponse(request.id, null, error.message);
                
                // Reset status after error
                setTimeout(() => {
                    if (connected) {
                        statusDiv.className = 'status connected';
                        statusDiv.innerHTML = '✅ Wallet connected - Ready for signing';
                    }
                }, 3000);
            }
        }

        async function sendResponse(id, result, error = null) {
            await fetch('/response', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, result, error })
            });
        }

        // Auto-connect if wallet is available
        window.addEventListener('load', () => {
            if (window.arweaveWallet) {
                // Check if already connected
                window.arweaveWallet.getActiveAddress()
                    .then(address => {
                        if (address) {
                            connectWallet();
                        }
                    })
                    .catch(() => {
                        // Not connected yet
                        log('Ready to connect wallet');
                    });
            } else {
                document.getElementById('status').className = 'status error';
                document.getElementById('status').innerHTML = '❌ No Arweave wallet extension detected';
                log('Please install Wander or ArConnect', 'error');
            }
        });
    </script>
</body>
</html>`;
  }
}
