const fs = require('fs');
const path = require('path');
const docx = require('docx');
const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableCell, TableRow, WidthType, BorderStyle } = docx;

const doc = new Document({
    sections: [{
        properties: {},
        children: [
            // Title
            new Paragraph({
                text: "The Lily Pad Launchpad",
                heading: HeadingLevel.TITLE,
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 }
            }),
            new Paragraph({
                text: "Creation Features Audit Report",
                heading: HeadingLevel.HEADING_1,
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 }
            }),

            // Date
            new Paragraph({
                children: [
                    new TextRun({ text: "Date: ", bold: true }),
                    new TextRun({ text: new Date().toLocaleDateString() })
                ],
                spacing: { after: 300 }
            }),

            // Executive Summary
            new Paragraph({
                text: "Executive Summary",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 }
            }),
            new Paragraph({
                text: "This audit covers all NFT creation features in The Lily Pad Launchpad, including collection deployment, candy machine creation, NFT minting (1-of-1 and editions), and the cart checkout flow. All features have been verified against Metaplex Core and Bubblegum V2 standards.",
                spacing: { after: 300 }
            }),

            // Files Audited
            new Paragraph({
                text: "Files Audited",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 }
            }),
            new Paragraph({ text: "• src/chains/solana/programs.ts — Collection, Candy Machine, Minting", spacing: { after: 100 } }),
            new Paragraph({ text: "• src/chains/solana/cartCheckout.ts — Cart checkout flow", spacing: { after: 100 } }),
            new Paragraph({ text: "• src/hooks/useSolanaLaunch.ts — React hooks", spacing: { after: 100 } }),
            new Paragraph({ text: "• src/components/raffles/CreateOneOfOneModal.tsx — 1-of-1 & Edition UI", spacing: { after: 300 } }),

            // Collection Creation
            new Paragraph({
                text: "1. Collection Creation (createCoreCollection)",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "Status: ", bold: true }),
                    new TextRun({ text: "✅ Functional with V2 support", color: "00AA00" })
                ],
                spacing: { after: 150 }
            }),
            new Paragraph({
                text: "Key Implementation Details:",
                heading: HeadingLevel.HEADING_3,
                spacing: { after: 150 }
            }),
            new Paragraph({ text: "• Uses createCollection helper which internally calls createCollectionV2 (mpl-core 1.10.0)", spacing: { after: 80 } }),
            new Paragraph({ text: "• Adds Royalties plugin with creators for verified creator attribution", spacing: { after: 80 } }),
            new Paragraph({ text: "• Adds BubblegumV2 plugin conditionally for compressed NFT support", spacing: { after: 80 } }),
            new Paragraph({ text: "• Retry logic for blockhash issues (3 attempts)", spacing: { after: 80 } }),
            new Paragraph({ text: "• Protocol memo for analytics", spacing: { after: 200 } }),
            new Paragraph({
                children: [
                    new TextRun({ text: "Location: ", bold: true }),
                    new TextRun({ text: "src/chains/solana/programs.ts:82-168" })
                ],
                spacing: { after: 300 }
            }),

            // Candy Machine
            new Paragraph({
                text: "2. Candy Machine Creation (createCoreCandyMachine)",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "Status: ", bold: true }),
                    new TextRun({ text: "✅ Functional", color: "00AA00" })
                ],
                spacing: { after: 150 }
            }),
            new Paragraph({
                text: "Features:",
                heading: HeadingLevel.HEADING_3,
                spacing: { after: 150 }
            }),
            new Paragraph({ text: "• Multi-phase guard groups with labels", spacing: { after: 80 } }),
            new Paragraph({ text: "• Payment guards (SOL/Token)", spacing: { after: 80 } }),
            new Paragraph({ text: "• Start/End date guards", spacing: { after: 80 } }),
            new Paragraph({ text: "• Mint limit per wallet", spacing: { after: 80 } }),
            new Paragraph({ text: "• Allowlist (Merkle root)", spacing: { after: 80 } }),
            new Paragraph({ text: "• NFT Gate & Address Gate", spacing: { after: 80 } }),
            new Paragraph({ text: "• Bot tax protection", spacing: { after: 80 } }),
            new Paragraph({ text: "• Retry logic for blockhash", spacing: { after: 200 } }),
            new Paragraph({
                children: [
                    new TextRun({ text: "Location: ", bold: true }),
                    new TextRun({ text: "src/chains/solana/programs.ts:300-508" })
                ],
                spacing: { after: 300 }
            }),

            // Cart Checkout
            new Paragraph({
                text: "3. Cart Checkout Flow (executeCartCheckout)",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "Status: ", bold: true }),
                    new TextRun({ text: "✅ Modern 2025 pattern implemented", color: "00AA00" })
                ],
                spacing: { after: 150 }
            }),
            new Paragraph({
                text: "Transaction Flow:",
                heading: HeadingLevel.HEADING_3,
                spacing: { after: 150 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "1. Upload", bold: true }),
                    new TextRun({ text: " — Turbo auto-debits (no signing)" })
                ],
                spacing: { after: 80 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "2. Cost Preview", bold: true }),
                    new TextRun({ text: " — Shows exact on-chain costs before signing" })
                ],
                spacing: { after: 80 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "3. Execute", bold: true }),
                    new TextRun({ text: " — Minimized signatures" })
                ],
                spacing: { after: 150 }
            }),
            new Paragraph({ text: "• 1-of-1 Core: 1 tx collection + mint tx(s)", spacing: { after: 80, indent: { left: 400 } } }),
            new Paragraph({ text: "• Editions cNFT: 1 tx collection + 1 tx tree + mint batch(es)", spacing: { after: 150, indent: { left: 400 } } }),
            new Paragraph({
                text: "Features:",
                heading: HeadingLevel.HEADING_3,
                spacing: { after: 150 }
            }),
            new Paragraph({ text: "• Tree auto-sizing based on item count", spacing: { after: 80 } }),
            new Paragraph({ text: "• Collection propagation wait (8s timeout)", spacing: { after: 80 } }),
            new Paragraph({ text: "• Batch minting: 10 cNFTs or 4 Core NFTs per tx", spacing: { after: 80 } }),
            new Paragraph({ text: "• Progress callbacks", spacing: { after: 80 } }),
            new Paragraph({ text: "• Creator attribution for Royalties plugin", spacing: { after: 200 } }),
            new Paragraph({
                children: [
                    new TextRun({ text: "Location: ", bold: true }),
                    new TextRun({ text: "src/chains/solana/cartCheckout.ts:163-337" })
                ],
                spacing: { after: 300 }
            }),

            // NFT Minting Table
            new Paragraph({
                text: "4. NFT Minting Functions",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 }
            }),
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ text: "Function", bold: true })] }),
                            new TableCell({ children: [new Paragraph({ text: "Purpose", bold: true })] }),
                            new TableCell({ children: [new Paragraph({ text: "Status", bold: true })] })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph("mintCompressedCoreNft")] }),
                            new TableCell({ children: [new Paragraph("Single cNFT mint")] }),
                            new TableCell({ children: [new Paragraph({ text: "✅", color: "00AA00" })] })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph("batchMintCompressedCoreNft")] }),
                            new TableCell({ children: [new Paragraph("Batch cNFT mint (max 10)")] }),
                            new TableCell({ children: [new Paragraph({ text: "✅", color: "00AA00" })] })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph("batchMintCoreNft")] }),
                            new TableCell({ children: [new Paragraph("Batch Core mint (max 5)")] }),
                            new TableCell({ children: [new Paragraph({ text: "✅", color: "00AA00" })] })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph("bulkMintCompressedLarge")] }),
                            new TableCell({ children: [new Paragraph("Bulk cNFT (100-1000+)")] }),
                            new TableCell({ children: [new Paragraph({ text: "✅", color: "00AA00" })] })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph("bulkMintCoreLarge")] }),
                            new TableCell({ children: [new Paragraph("Bulk Core (100-500+)")] }),
                            new TableCell({ children: [new Paragraph({ text: "✅", color: "00AA00" })] })
                        ]
                    })
                ]
            }),
            new Paragraph({
                text: "Critical Fix Applied:",
                italics: true,
                spacing: { before: 200, after: 100 }
            }),
            new Paragraph({
                text: "All mint functions include collectionAuthority: umi.identity for verified cNFT minting into Core Collections (Bubblegum V2 requirement).",
                spacing: { after: 300 }
            }),

            // UI Integration
            new Paragraph({
                text: "5. UI Integration (CreateOneOfOneModal)",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "Status: ", bold: true }),
                    new TextRun({ text: "✅ Cart checkout integrated", color: "00AA00" })
                ],
                spacing: { after: 150 }
            }),
            new Paragraph({
                text: "Flow:",
                heading: HeadingLevel.HEADING_3,
                spacing: { after: 150 }
            }),
            new Paragraph({ text: "1. Upload to Arweave via Irys/Turbo", spacing: { after: 80 } }),
            new Paragraph({ text: "2. Cost estimate preview", spacing: { after: 80 } }),
            new Paragraph({ text: "3. Checkout modal confirmation", spacing: { after: 80 } }),
            new Paragraph({ text: "4. On-chain deployment + minting", spacing: { after: 80 } }),
            new Paragraph({ text: "5. DB finalization with timeout handling (20s)", spacing: { after: 200 } }),
            new Paragraph({
                text: "Chains Supported:",
                heading: HeadingLevel.HEADING_3,
                spacing: { after: 150 }
            }),
            new Paragraph({ text: "• Solana — Full cart checkout flow", spacing: { after: 80 } }),
            new Paragraph({ text: "• Monad — Direct deployment (separate path)", spacing: { after: 300 } }),

            // Issues Fixed
            new Paragraph({
                text: "6. Issues Found & Fixed",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 }
            }),
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: [
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ text: "Issue", bold: true })] }),
                            new TableCell({ children: [new Paragraph({ text: "Location", bold: true })] }),
                            new TableCell({ children: [new Paragraph({ text: "Fix", bold: true })] })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph("fetchCollectionV2 didn't exist")] }),
                            new TableCell({ children: [new Paragraph("BurnNFTModal, useMplCore, etc.")] }),
                            new TableCell({ children: [new Paragraph("Upgraded mpl-core to 1.10.0, reverted to fetchCollection helper")] })
                        ]
                    }),
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph("CollectionV1 account errors")] }),
                            new TableCell({ children: [new Paragraph("All collection fetches")] }),
                            new TableCell({ children: [new Paragraph("mpl-core 1.10.0 fetchCollection handles both V1/V2")] })
                        ]
                    })
                ]
            }),
            new Paragraph({ spacing: { after: 300 } }),

            // Recommendations
            new Paragraph({
                text: "7. Recommendations",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "1. ", bold: true }),
                    new TextRun({ text: "Add timeout handling", bold: true }),
                    new TextRun({ text: " for cartCheckout collection creation step (currently only in tree step)" })
                ],
                spacing: { after: 150 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "2. ", bold: true }),
                    new TextRun({ text: "Consider adding safeFetchCollection", bold: true }),
                    new TextRun({ text: " with null handling for edge cases where collection might not be immediately visible" })
                ],
                spacing: { after: 150 }
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "3. ", bold: true }),
                    new TextRun({ text: "Monitor", bold: true }),
                    new TextRun({ text: " RPC indexing delays after minting — the code has 15s timeout for parsing leaf IDs" })
                ],
                spacing: { after: 300 }
            }),

            // Conclusion
            new Paragraph({
                text: "Conclusion",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 }
            }),
            new Paragraph({
                text: "All creation features are functional and follow Metaplex's recommended patterns for Core + Bubblegum V2. The upgrade to mpl-core 1.10.0 resolved the CollectionV1/V2 compatibility issues. The cart checkout flow provides a modern, minimal-signing UX that aligns with 2025 Solana best practices.",
                spacing: { after: 200 }
            }),
            new Paragraph({
                text: "Report generated by The Lily Pad AI Assistant",
                italics: true,
                alignment: AlignmentType.CENTER,
                spacing: { before: 400 }
            })
        ]
    }]
});

// Generate document
const buffer = docx.Packer.toBuffer(doc);
buffer.then(data => {
    const outputPath = path.join(__dirname, '..', 'Launchpad_Audit_Report.docx');
    fs.writeFileSync(outputPath, data);
    console.log(`Document created: ${outputPath}`);
});
