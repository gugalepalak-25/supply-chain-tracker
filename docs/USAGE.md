# How to Use Supply Chain Tracker

## What You Need

- **Lace Wallet** — browser extension for Midnight (install from [lace.io](https://lace.io))
- **Preprod tNIGHT** — test tokens from the Preprod faucet
- **A product to track** — any physical item with a unique batch code

## Step-by-Step Guide

### 1. Connect Your Wallet

1. Open the app at [supply-chain-tracker-nu.vercel.app](https://supply-chain-tracker-nu.vercel.app)
2. Click **Connect Wallet** in the top right
3. Approve the connection in your Lace wallet
4. Your wallet address will appear when connected

### 2. Register a Product (Manufacturer)

1. Click **+ Register Product** on the dashboard
2. Fill in the form:
   - **Product ID** — unique identifier (e.g., `BATCH-2026-001`)
   - **Name** — product name (e.g., "Organic Coffee Beans")
   - **Manufacturer** — your company name
   - **Location** — where it was made
   - **Note** — optional description
3. Click **Register**
4. **IMPORTANT**: Save the two secret codes shown:
   - **Batch Secret** — for consumers to verify authenticity
   - **Handoff Secret** — for distributors to record checkpoints
5. Share the batch secret with the consumer (printed on product label)
6. Share the handoff secret with the distributor (private channel only)

### 3. Record a Checkpoint (Distributor)

1. Open the product page (click a product card on the dashboard)
2. Click **Record Checkpoint**
3. Enter the location and note
4. The checkpoint is recorded on-chain with a ZK proof

### 4. Verify Authenticity (Consumer)

**Method 1: With the secret code**
1. Open the product page
2. Paste your 64-character hex seal code
3. Click **Check**
4. The app proves authenticity in zero-knowledge

**Method 2: From your wallet**
1. Click **Verify Authenticity** on the product page
2. Approve the transaction in your wallet
3. The verification is recorded on-chain

### 5. Use Private Allowlist Access

**As an admin:**
1. Go to the **Allowlist** page (click "Allowlist" in the header)
2. Enter a member label (e.g., "Alice")
3. Click **Add Member**
4. Copy the generated secret
5. Share it privately with the member (Signal, encrypted email, in-person)

**As a member:**
1. Get your secret from the admin
2. Go to the **Allowlist** page
3. Paste your secret in the "Prove Membership" panel
4. Click **Prove Membership**
5. Your membership is proved without revealing your identity

## What Gets Proved (and What Stays Private)

| Data | On-Chain | Private |
|------|----------|---------|
| Product name, manufacturer, stage | ✅ Public | |
| Checkpoint locations and notes | ✅ Public | |
| Batch secret (authenticity seal) | | 🔒 Never on-chain |
| Handoff secret (transfer auth) | | 🔒 Never on-chain |
| Your identity when proving membership | | 🔒 Never revealed |
| SHA-256 commitments of secrets | ✅ Public (hash only) | |

## Troubleshooting

**"Wallet not detected"**
- Install Lace wallet extension
- Refresh the page after installing

**"Not enough DUST"**
- Wait a few seconds and try again
- DUST tokens are generated automatically

**"Proof failed"**
- Make sure you're connected to Preprod network
- Check that the product exists
- Try disconnecting and reconnecting your wallet

**"Product already registered"**
- The Product ID is already taken
- Use a different ID

**Allowlist: "Not a member"**
- Ask the admin to add you first
- Make sure you're using the correct secret
