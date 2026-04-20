import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Clock, Loader2, Ticket, Trophy, Info } from "lucide-react";
import { format, addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useWallet } from "@/providers/WalletProvider";

interface NFT {
  id: string;
  token_id: number;
  name: string | null;
  description: string | null;
  image_url: string | null;
  collection_id: string;
  collection?: {
    id: string;
    name: string;
    contract_address: string | null;
  } | null;
}

interface CreateRaffleForNFTProps {
  nft: NFT | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateRaffleForNFT({ nft, open, onOpenChange, onSuccess }: CreateRaffleForNFTProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [entryPrice, setEntryPrice] = useState("0.1");
  const [maxTicketsPerUser, setMaxTicketsPerUser] = useState("10");
  const [winnerCount, setWinnerCount] = useState("1");
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(addDays(new Date(), 7));
  const [isCreating, setIsCreating] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const { address } = useWallet();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUserId(session?.user?.id ?? null);
    });
  }, []);

  const handleSubmit = async () => {
    if (!nft || !address) {
      toast.error("Please connect your wallet");
      return;
    }

    if (!name.trim()) {
      toast.error("Please enter a raffle name");
      return;
    }

    if (!startDate || !endDate) {
      toast.error("Please select start and end dates");
      return;
    }

    if (endDate <= startDate) {
      toast.error("End date must be after start date");
      return;
    }

    setIsCreating(true);

    try {
      // Create the raffle with the NFT as prize
      const { data: raffle, error } = await supabase
        .from("lily_raffles")
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          image_url: nft.image_url,
          prize_type: "nft",
          prize_details: [
            {
              type: "nft",
              name: nft.name || "1-of-1 NFT",
              nft_id: nft.id,
              collection_id: nft.collection_id,
              collection_name: nft.collection?.name,
              contract_address: nft.collection?.contract_address,
            }
          ],
          entry_price: parseFloat(entryPrice) || 0,
          max_tickets_per_user: parseInt(maxTicketsPerUser) || null,
          winner_count: parseInt(winnerCount) || 1,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          is_active: true,
          is_drawn: false,
          created_by: currentUserId,
          creator_address: address,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("Raffle created successfully!");
      onSuccess();
      onOpenChange(false);
      
      // Reset form
      setName("");
      setDescription("");
      setEntryPrice("0.1");
      setMaxTicketsPerUser("10");
      setWinnerCount("1");
      setStartDate(new Date());
      setEndDate(addDays(new Date(), 7));
      
    } catch (error) {
      console.error("Error creating raffle:", error);
      toast.error("Failed to create raffle");
    } finally {
      setIsCreating(false);
    }
  };

  if (!nft) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="w-5 h-5" />
            Create Raffle for 1-of-1
          </DialogTitle>
          <DialogDescription>
            Set up a raffle with your {nft.name || "1-of-1 NFT"} as the prize
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* NFT Preview */}
          <Card className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex gap-4">
                {nft.image_url ? (
                  <img
                    src={nft.image_url}
                    alt={nft.name || "NFT"}
                    className="w-24 h-24 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-lg bg-muted flex items-center justify-center">
                    <Trophy className="w-8 h-8 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{nft.name || "Unnamed NFT"}</h3>
                  <p className="text-sm text-muted-foreground">
                    {nft.collection?.name || "1-of-1 Collection"}
                  </p>
                  <Badge variant="secondary" className="mt-2">Prize NFT</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Raffle Details */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Raffle Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Epic 1/1 Art Giveaway"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your raffle..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="entryPrice">Entry Price (SOL)</Label>
                <Input
                  id="entryPrice"
                  type="number"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxTickets">Max Tickets/User</Label>
                <Input
                  id="maxTickets"
                  type="number"
                  value={maxTicketsPerUser}
                  onChange={(e) => setMaxTicketsPerUser(e.target.value)}
                  min="1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="winners">Number of Winners</Label>
                <Input
                  id="winners"
                  type="number"
                  value={winnerCount}
                  onChange={(e) => setWinnerCount(e.target.value)}
                  min="1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      disabled={(date) => date < new Date()}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      disabled={(date) => date <= (startDate || new Date())}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Info Card */}
            <div className="bg-muted/50 rounded-lg p-4 text-sm">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 mt-0.5 text-muted-foreground" />
                <div className="space-y-1 text-muted-foreground">
                  <p>• Your NFT will be locked as the raffle prize</p>
                  <p>• Winner will receive the NFT when raffle ends</p>
                  <p>• Entry fees go to your wallet minus platform fee (2.5%)</p>
                  <p>• You can cancel the raffle before it starts</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isCreating || !name.trim()}
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Ticket className="w-4 h-4 mr-2" />
                Create Raffle
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CreateRaffleForNFT;
