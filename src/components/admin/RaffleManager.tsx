import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Ticket, Trophy, Users, Clock, Trash2, Eye, Gift, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface Raffle {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  prize_type: string;
  prize_details: any[];
  entry_price: number;
  max_tickets_per_user: number | null;
  total_tickets: number;
  required_collection_id: string | null;
  start_date: string;
  end_date: string;
  winner_count: number;
  winners: any[];
  is_active: boolean;
  is_drawn: boolean;
  drawn_at: string | null;
  created_at: string;
}

interface Prize {
  type: "nft" | "token" | "shop_item";
  name: string;
  value: string;
  quantity: number;
}

const RaffleManager = () => {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [selectedRaffle, setSelectedRaffle] = useState<Raffle | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [prizeType, setPrizeType] = useState<string>("mixed");
  const [entryPrice, setEntryPrice] = useState("0");
  const [maxTickets, setMaxTickets] = useState("10");
  const [winnerCount, setWinnerCount] = useState("1");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [requiredCollectionId, setRequiredCollectionId] = useState("");
  const [prizes, setPrizes] = useState<Prize[]>([{ type: "token", name: "", value: "", quantity: 1 }]);

  const { data: raffles, isLoading } = useQuery({
    queryKey: ["admin-raffles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lily_raffles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as Raffle[];
    },
  });

  const { data: collections } = useQuery({
    queryKey: ["collections-for-raffle"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collections")
        .select("id, name")
        .order("name");

      if (error) throw error;
      return data;
    },
  });

  const { data: raffleEntries } = useQuery({
    queryKey: ["raffle-entries", selectedRaffle?.id],
    queryFn: async () => {
      if (!selectedRaffle?.id) return [];
      const { data, error } = await supabase
        .from("lily_raffle_entries")
        .select("*")
        .eq("raffle_id", selectedRaffle.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!selectedRaffle?.id,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const raffleData = {
        name,
        description: description || null,
        image_url: imageUrl || null,
        prize_type: prizeType,
        prize_details: prizes.filter(p => p.name && p.value),
        entry_price: parseFloat(entryPrice) || 0,
        max_tickets_per_user: parseInt(maxTickets) || 10,
        winner_count: parseInt(winnerCount) || 1,
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(endDate).toISOString(),
        required_collection_id: requiredCollectionId || null,
        created_by: user.id,
      };

      const { error } = await supabase
        .from("lily_raffles")
        .insert(raffleData as any);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-raffles"] });
      toast.success("Raffle created successfully!");
      resetForm();
      setIsCreateOpen(false);
    },
    onError: (error: any) => {
      toast.error("Failed to create raffle: " + error.message);
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("lily_raffles")
        .update({ is_active: isActive })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-raffles"] });
      toast.success("Raffle updated!");
    },
    onError: (error: any) => {
      toast.error("Failed to update raffle: " + error.message);
    },
  });

  const drawWinnersMutation = useMutation({
    mutationFn: async (raffleId: string) => {
      const raffle = raffles?.find(r => r.id === raffleId);
      if (!raffle) throw new Error("Raffle not found");

      // Get all entries
      const { data: entries, error: entriesError } = await supabase
        .from("lily_raffle_entries")
        .select("*")
        .eq("raffle_id", raffleId);

      if (entriesError) throw entriesError;
      if (!entries?.length) throw new Error("No entries to draw from");

      // Create ticket pool (weighted by ticket_count)
      const ticketPool: string[] = [];
      entries.forEach(entry => {
        for (let i = 0; i < entry.ticket_count; i++) {
          ticketPool.push(entry.user_id);
        }
      });

      // Draw winners (unique users)
      const winners: string[] = [];
      const shuffled = [...ticketPool].sort(() => Math.random() - 0.5);

      for (const userId of shuffled) {
        if (!winners.includes(userId) && winners.length < raffle.winner_count) {
          winners.push(userId);
        }
        if (winners.length >= raffle.winner_count) break;
      }

      // Update raffle with winners
      const { error: updateError } = await supabase
        .from("lily_raffles")
        .update({
          winners,
          is_drawn: true,
          drawn_at: new Date().toISOString(),
          is_active: false,
        })
        .eq("id", raffleId);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-raffles"] });
      toast.success("Winners drawn successfully!");
    },
    onError: (error: any) => {
      toast.error("Failed to draw winners: " + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lily_raffles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-raffles"] });
      toast.success("Raffle deleted!");
    },
    onError: (error: any) => {
      toast.error("Failed to delete raffle: " + error.message);
    },
  });

  const resetForm = () => {
    setName("");
    setDescription("");
    setImageUrl("");
    setPrizeType("mixed");
    setEntryPrice("0");
    setMaxTickets("10");
    setWinnerCount("1");
    setStartDate("");
    setEndDate("");
    setRequiredCollectionId("");
    setPrizes([{ type: "token", name: "", value: "", quantity: 1 }]);
  };

  const addPrize = () => {
    setPrizes([...prizes, { type: "token", name: "", value: "", quantity: 1 }]);
  };

  const removePrize = (index: number) => {
    setPrizes(prizes.filter((_, i) => i !== index));
  };

  const updatePrize = (index: number, field: keyof Prize, value: any) => {
    const updated = [...prizes];
    updated[index] = { ...updated[index], [field]: value };
    setPrizes(updated);
  };

  const getRaffleStatus = (raffle: Raffle) => {
    const now = new Date();
    const start = new Date(raffle.start_date);
    const end = new Date(raffle.end_date);

    if (raffle.is_drawn) return { label: "Drawn", variant: "secondary" as const };
    if (!raffle.is_active) return { label: "Inactive", variant: "outline" as const };
    if (now < start) return { label: "Upcoming", variant: "default" as const };
    if (now > end) return { label: "Ended", variant: "destructive" as const };
    return { label: "Live", variant: "default" as const };
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="w-5 h-5" />
            Lily Raffles
          </CardTitle>
          <CardDescription>Create and manage raffles with NFT, token, or item prizes</CardDescription>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Raffle
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Raffle</DialogTitle>
              <DialogDescription>Set up a new raffle with prizes and entry requirements</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Raffle Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Epic NFT Giveaway"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="imageUrl">Image URL</Label>
                  <Input
                    id="imageUrl"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the raffle..."
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Entry Price (SOL)</Label>
                  <Input
                    type="number"
                    value={entryPrice}
                    onChange={(e) => setEntryPrice(e.target.value)}
                    min="0"
                    step="0.01"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Tickets/User</Label>
                  <Input
                    type="number"
                    value={maxTickets}
                    onChange={(e) => setMaxTickets(e.target.value)}
                    min="1"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Number of Winners</Label>
                  <Input
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
                  <Input
                    type="datetime-local"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input
                    type="datetime-local"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Required NFT Collection (Optional)</Label>
                <Select
                  value={requiredCollectionId || "__none__"}
                  onValueChange={(v) => setRequiredCollectionId(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No requirement (open to all)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No requirement</SelectItem>
                    {collections?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Prizes</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addPrize}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Prize
                  </Button>
                </div>
                {prizes.map((prize, index) => (
                  <div key={index} className="flex gap-2 items-end">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Type</Label>
                      <Select
                        value={prize.type}
                        onValueChange={(v) => updatePrize(index, "type", v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nft">NFT</SelectItem>
                          <SelectItem value="token">SOL Tokens</SelectItem>
                          <SelectItem value="shop_item">Shop Item</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Name</Label>
                      <Input
                        value={prize.name}
                        onChange={(e) => updatePrize(index, "name", e.target.value)}
                        placeholder="Prize name"
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Value/ID</Label>
                      <Input
                        value={prize.value}
                        onChange={(e) => updatePrize(index, "value", e.target.value)}
                        placeholder="Amount or ID"
                      />
                    </div>
                    <div className="w-20 space-y-1">
                      <Label className="text-xs">Qty</Label>
                      <Input
                        type="number"
                        value={prize.quantity}
                        onChange={(e) => updatePrize(index, "quantity", parseInt(e.target.value) || 1)}
                        min="1"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removePrize(index)}
                      disabled={prizes.length <= 1}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !name || !startDate || !endDate}
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Raffle
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent>
        {!raffles?.length ? (
          <div className="text-center py-8 text-muted-foreground">
            <Ticket className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No raffles created yet</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Entry Price</TableHead>
                <TableHead>Entries</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {raffles.map((raffle) => {
                const status = getRaffleStatus(raffle);
                return (
                  <TableRow key={raffle.id}>
                    <TableCell className="font-medium">{raffle.name}</TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell>{raffle.entry_price} SOL</TableCell>
                    <TableCell>{raffle.total_tickets} tickets</TableCell>
                    <TableCell>{format(new Date(raffle.end_date), "MMM d, yyyy HH:mm")}</TableCell>
                    <TableCell>
                      <Switch
                        checked={raffle.is_active}
                        onCheckedChange={(checked) =>
                          toggleActiveMutation.mutate({ id: raffle.id, isActive: checked })
                        }
                        disabled={raffle.is_drawn}
                      />
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedRaffle(raffle);
                          setIsViewOpen(true);
                        }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {!raffle.is_drawn && new Date() > new Date(raffle.end_date) && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => drawWinnersMutation.mutate(raffle.id)}
                          disabled={drawWinnersMutation.isPending}
                        >
                          <Trophy className="w-4 h-4 mr-1" />
                          Draw
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteMutation.mutate(raffle.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* View Raffle Dialog */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedRaffle?.name}</DialogTitle>
            <DialogDescription>{selectedRaffle?.description}</DialogDescription>
          </DialogHeader>

          {selectedRaffle && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Entry Price</p>
                  <p className="font-medium">{selectedRaffle.entry_price} SOL</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total Entries</p>
                  <p className="font-medium">{selectedRaffle.total_tickets} tickets</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Winners</p>
                  <p className="font-medium">{selectedRaffle.winner_count}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge variant={getRaffleStatus(selectedRaffle).variant}>
                    {getRaffleStatus(selectedRaffle).label}
                  </Badge>
                </div>
              </div>

              {selectedRaffle.is_drawn && selectedRaffle.winners.length > 0 && (
                <div className="p-4 bg-primary/10 rounded-lg">
                  <h4 className="font-medium flex items-center gap-2 mb-2">
                    <Trophy className="w-4 h-4" />
                    Winners
                  </h4>
                  <ul className="text-sm space-y-1">
                    {selectedRaffle.winners.map((winnerId: string, i: number) => (
                      <li key={i} className="font-mono text-xs">
                        {i + 1}. {winnerId.slice(0, 8)}...{winnerId.slice(-6)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Recent Entries ({raffleEntries?.length || 0})
                </h4>
                {raffleEntries?.slice(0, 5).map((entry: any) => (
                  <div key={entry.id} className="text-sm flex justify-between py-1 border-b border-border/50">
                    <span className="font-mono text-xs">{entry.user_id.slice(0, 8)}...</span>
                    <span>{entry.ticket_count} tickets</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default RaffleManager;