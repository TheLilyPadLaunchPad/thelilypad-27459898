import { Wallet } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useWallet } from "@/providers/WalletProvider";

interface WalletConnectButtonProps extends Omit<ButtonProps, "onClick"> {
  /** Override the label. Defaults to "Connect via WalletConnect". */
  label?: string;
}

/**
 * Opens the Reown AppKit modal. Works for both EVM (Monad) and Solana —
 * the modal lets the user pick a chain and a wallet.
 */
export function WalletConnectButton({
  label = "Connect via WalletConnect",
  variant = "outline",
  size = "default",
  className,
  ...rest
}: WalletConnectButtonProps) {
  const { connect, isConnecting } = useWallet();
  return (
    <Button
      {...rest}
      variant={variant}
      size={size}
      className={className}
      disabled={rest.disabled || isConnecting}
      onClick={() => void connect()}
    >
      <Wallet className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}

export default WalletConnectButton;
