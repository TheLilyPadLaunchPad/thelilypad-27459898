import React from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/sections/Footer";
import { FeeCalculator } from "@/components/FeeCalculator";
import { useSEO } from "@/hooks/useSEO";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Coins, Fuel, Percent, Info, Shield, HelpCircle, Sparkles } from "lucide-react";

const FeesAndPricing: React.FC = () => {
  useSEO({
    title: "Fees & Pricing | The Lily Pad",
    description: "Understand all platform fees, gas costs, and creator royalties on The Lily Pad NFT marketplace on Solana.",
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 py-12 max-w-5xl">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <Badge variant="outline" className="mb-4">
            <Coins className="w-3 h-3 mr-1" />
            Transparent Pricing
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Fees & Pricing
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            We believe in complete transparency. Here's everything you need to know about fees on The Lily Pad.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-5">
          {/* Main Content */}
          <div className="lg:col-span-3 space-y-8">
            {/* Platform Fees */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Percent className="w-5 h-5 text-primary" />
                  Platform Fees
                </CardTitle>
                <CardDescription>
                  Fees charged by The Lily Pad platform
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center p-4 rounded-lg bg-muted/30">
                  <div>
                    <p className="font-medium">Launchpad Mint Fee</p>
                    <p className="text-sm text-muted-foreground">On primary mints (1.25% for mints ≥ 0.3 SOL)</p>
                  </div>
                  <Badge variant="secondary" className="text-lg px-3 py-1">2.0%</Badge>
                </div>

                <div className="flex justify-between items-center p-4 rounded-lg bg-muted/30">
                  <div>
                    <p className="font-medium">Marketplace Fee</p>
                    <p className="text-sm text-muted-foreground">On secondary sales (creator royalty paid on top)</p>
                  </div>
                  <Badge variant="secondary" className="text-lg px-3 py-1">2.0%</Badge>
                </div>

                <div className="flex justify-between items-center p-4 rounded-lg bg-muted/30">
                  <div>
                    <p className="font-medium">Listing Fee</p>
                    <p className="text-sm text-muted-foreground">To list NFTs for sale</p>
                  </div>
                  <Badge variant="outline" className="text-lg px-3 py-1 text-primary">Free</Badge>
                </div>

                {/* Internal split */}
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 space-y-2">
                  <p className="font-medium text-sm">How the 2.0% is split</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded bg-background p-2">
                      <div className="text-muted-foreground">Treasury</div>
                      <div className="font-semibold">1.50%</div>
                    </div>
                    <div className="rounded bg-background p-2">
                      <div className="text-muted-foreground">Team</div>
                      <div className="font-semibold">0.25%</div>
                    </div>
                    <div className="rounded bg-background p-2">
                      <div className="text-muted-foreground">Buyback</div>
                      <div className="font-semibold">0.25%</div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Buyback funds are used to repurchase Lily Pad assets benefiting holders. Treasury funds platform operations and Arweave storage.
                  </p>
                </div>
              </CardContent>

            </Card>

            {/* Creator Royalties */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  Creator Royalties
                </CardTitle>
                <CardDescription>
                  Royalties set by NFT collection creators
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Creators can set royalties between <strong>0% and 10%</strong> on their collections.
                  These royalties are paid to creators on every secondary sale.
                </p>

                <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Creator-First Approach</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        We enforce creator royalties to ensure artists are compensated for their work.
                        Royalty percentages are visible on each collection's page.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Gas & Blockchain Fees */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Fuel className="w-5 h-5 text-primary" />
                  Gas & Blockchain Fees
                </CardTitle>
                <CardDescription>
                  Network fees paid to validators
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Gas fees are paid directly to network validators for processing transactions.
                  The Lily Pad does not receive any portion of gas fees.
                </p>

                <div className="p-4 rounded-lg bg-muted/30">
                  <p className="text-sm font-medium mb-2">How Gas is Calculated</p>
                  <code className="text-xs bg-background p-2 rounded block">
                    Total Gas = Gas Limit × Gas Price
                  </code>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Operation</TableHead>
                      <TableHead className="text-right">Approx. Gas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>NFT Mint (base)</TableCell>
                      <TableCell className="text-right font-mono">150,000</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Per additional NFT</TableCell>
                      <TableCell className="text-right font-mono">+50,000</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Token Transfer</TableCell>
                      <TableCell className="text-right font-mono">21,000</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>NFT Purchase</TableCell>
                      <TableCell className="text-right font-mono">~100,000</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">Devnet</p>
                    <p className="font-medium text-sm">Minimal gas costs</p>
                    <p className="text-xs text-muted-foreground">Free test tokens from faucet</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">Mainnet</p>
                    <p className="font-medium text-sm">Standard gas prices</p>
                    <p className="text-xs text-muted-foreground">Real SOL required</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cost Breakdown Example */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="w-5 h-5 text-primary" />
                  Example Cost Breakdown
                </CardTitle>
                <CardDescription>
                  Minting 1 NFT at 0.50 SOL
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 font-mono text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mint Cost:</span>
                    <span>0.5000 SOL</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">+ Platform Fee (2.0%):</span>
                    <span>0.0100 SOL</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">+ Gas Fee (est.):</span>
                    <span>~0.0002 SOL</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold">
                    <span>Total:</span>
                    <span className="text-primary">~0.5102 SOL</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground pt-1">
                    <span>Creator receives:</span>
                    <span>0.4900 SOL</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* FAQ */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-primary" />
                  Frequently Asked Questions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="who-pays">
                    <AccordionTrigger>Who pays the platform fee?</AccordionTrigger>
                    <AccordionContent>
                      The platform fee is deducted from the seller's proceeds. For mints, this comes from the collection creator's revenue. For secondary sales, this comes from the seller's sale amount, after the original creator's royalty is paid.
                    </AccordionContent>
                  </AccordionItem>


                  <AccordionItem value="waive-fee">
                    <AccordionTrigger>Can creators waive the platform fee?</AccordionTrigger>
                    <AccordionContent>
                      The platform fee is a standard rate that applies to all transactions. However, creators can adjust their mint prices to account for fees when pricing their collections.
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="gas-fluctuate">
                    <AccordionTrigger>Why do gas fees fluctuate?</AccordionTrigger>
                    <AccordionContent>
                      Gas fees are determined by network demand. When many users are transacting on Solana, gas prices increase due to competition for block space. Gas prices typically decrease during lower-activity periods.
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="hidden-fees">
                    <AccordionTrigger>Are there any hidden fees?</AccordionTrigger>
                    <AccordionContent>
                      No. We believe in full transparency. The only fees are the platform fee (2.0%, split 1.5% Treasury / 0.25% Team / 0.25% Buyback), creator royalties (set by each collection, 0–10%), and blockchain gas fees (paid to network validators).
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="bulk-savings">
                    <AccordionTrigger>Do I save on gas when minting multiple NFTs?</AccordionTrigger>
                    <AccordionContent>
                      Yes! Minting multiple NFTs in a single transaction uses less gas per NFT compared to individual transactions. You can save 15-40% on gas fees by bulk minting.
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Fee Calculator */}
          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-24">
              <FeeCalculator />

              {/* Disclaimers */}
              <Card className="mt-6 bg-muted/20">
                <CardContent className="pt-6">
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <p className="flex items-start gap-2">
                      <Info className="w-3 h-3 mt-0.5 shrink-0" />
                      All fees are subject to change with prior notice.
                    </p>
                    <p className="flex items-start gap-2">
                      <Info className="w-3 h-3 mt-0.5 shrink-0" />
                      Gas estimates are approximations and may vary.
                    </p>
                    <p className="flex items-start gap-2">
                      <Info className="w-3 h-3 mt-0.5 shrink-0" />
                      Native blockchain fees apply to all transactions.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default FeesAndPricing;
