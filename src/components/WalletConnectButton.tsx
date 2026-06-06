import { Wallet } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { openWalletModal } from "@/integrations/reown/appkit";

interface WalletConnectButtonProps extends Omit<ButtonProps, "onClick"> {
  /** Override the label. Defaults to "Connect via WalletConnect". */
  label?: string;
}

/**
 * Opens the Reown AppKit modal. Works for both EVM (Monad) and Solana —
 * the modal lets the user pick a chain and a wallet. Sits alongside the
 * existing Phantom-native connect flows.
 */
export function WalletConnectButton({
  label = "Connect via WalletConnect",
  variant = "outline",
  size = "default",
  className,
  ...rest
}: WalletConnectButtonProps) {
  return (
    <Button
      {...rest}
      variant={variant}
      size={size}
      className={className}
      onClick={() => openWalletModal("Connect")}
    >
      <Wallet className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}

export default WalletConnectButton;
