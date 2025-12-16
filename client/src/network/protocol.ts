import { MessageType, NetworkPlayerData, KeyFlags, PlayerFlags, ColorPalette } from '@/types';

// Binary protocol encoder/decoder

export class Protocol {
  private sequenceNumber = 0;

  // Encode join room message
  encodeJoin(name: string, colorIndex: number): ArrayBuffer {
    const nameBytes = new TextEncoder().encode(name);
    const buffer = new ArrayBuffer(3 + nameBytes.length);
    const view = new DataView(buffer);
    const arr = new Uint8Array(buffer);

    view.setUint8(0, MessageType.JoinRoom);
    view.setUint8(1, nameBytes.length);
    arr.set(nameBytes, 2);
    view.setUint8(2 + nameBytes.length, colorIndex);

    return buffer;
  }

  // Encode input message (6 bytes)
  encodeInput(
    keys: { ArrowUp: boolean; ArrowDown: boolean; ArrowLeft: boolean; ArrowRight: boolean },
    steering: number,
    throttle: number,
    flags: number = 0
  ): ArrayBuffer {
    const buffer = new ArrayBuffer(6);
    const view = new DataView(buffer);

    // Encode key flags
    let keyFlags = 0;
    if (keys.ArrowUp) keyFlags |= KeyFlags.Up;
    if (keys.ArrowDown) keyFlags |= KeyFlags.Down;
    if (keys.ArrowLeft) keyFlags |= KeyFlags.Left;
    if (keys.ArrowRight) keyFlags |= KeyFlags.Right;

    view.setUint8(0, MessageType.Input);
    view.setUint8(1, this.sequenceNumber++ & 0xff);
    view.setUint8(2, keyFlags);
    view.setInt8(3, Math.round(steering * 127));
    view.setInt8(4, Math.round(throttle * 127));
    view.setUint8(5, flags);

    return buffer;
  }

  // Encode ping message
  encodePing(): ArrayBuffer {
    const buffer = new ArrayBuffer(9);
    const view = new DataView(buffer);
    const timestamp = Date.now();

    view.setUint8(0, MessageType.Ping);
    // Write timestamp as 8 bytes (little endian)
    view.setBigUint64(1, BigInt(timestamp), true);

    return buffer;
  }

  // Encode leave message
  encodeLeave(): ArrayBuffer {
    const buffer = new ArrayBuffer(1);
    const view = new DataView(buffer);
    view.setUint8(0, MessageType.LeaveRoom);
    return buffer;
  }

  // Decode incoming message type
  getMessageType(data: ArrayBuffer): MessageType {
    const view = new DataView(data);
    return view.getUint8(0) as MessageType;
  }

  // Decode state update message
  decodeStateUpdate(data: ArrayBuffer): { tick: number; players: NetworkPlayerData[] } {
    const view = new DataView(data);

    const tick = view.getUint16(1, true);
    const playerCount = view.getUint8(3);

    const players: NetworkPlayerData[] = [];
    let offset = 4;

    for (let i = 0; i < playerCount; i++) {
      players.push({
        id: view.getUint16(offset, true),
        x: view.getInt16(offset + 2, true) / 10, // Scaled by 10
        y: view.getInt32(offset + 4, true),
        speed: view.getInt16(offset + 8, true) / 10, // Scaled by 10
        angle: view.getInt8(offset + 10) * 25 / 127, // Scaled from -127..127 to -25..25
        rating: view.getUint8(offset + 11) |
                (view.getUint8(offset + 12) << 8) |
                (view.getUint8(offset + 13) << 16), // 24-bit
        flags: view.getUint8(offset + 14),
        color: view.getUint8(offset + 15),
      });
      offset += 16;
    }

    return { tick, players };
  }

  // Decode player join message
  decodePlayerJoin(data: ArrayBuffer): { id: number; name: string; color: number } {
    const view = new DataView(data);
    const id = view.getUint16(1, true);
    const nameLen = view.getUint8(3);
    const nameBytes = new Uint8Array(data, 4, nameLen);
    const name = new TextDecoder().decode(nameBytes);
    const color = view.getUint8(4 + nameLen);

    return { id, name, color };
  }

  // Decode player leave message
  decodePlayerLeave(data: ArrayBuffer): { id: number } {
    const view = new DataView(data);
    return { id: view.getUint16(1, true) };
  }

  // Decode room info message
  decodeRoomInfo(data: ArrayBuffer): { roomId: string; playerCount: number; maxPlayers: number; yourId: number } {
    const view = new DataView(data);
    const roomIdLen = view.getUint8(1);
    const roomIdBytes = new Uint8Array(data, 2, roomIdLen);
    const roomId = new TextDecoder().decode(roomIdBytes);
    const offset = 2 + roomIdLen;

    return {
      roomId,
      playerCount: view.getUint8(offset),
      maxPlayers: view.getUint8(offset + 1),
      yourId: view.getUint16(offset + 2, true),
    };
  }

  // Decode pong message
  decodePong(data: ArrayBuffer): { timestamp: number; latency: number } {
    const view = new DataView(data);
    const timestamp = Number(view.getBigUint64(1, true));
    const latency = Date.now() - timestamp;
    return { timestamp, latency };
  }

  // Decode error message
  decodeError(data: ArrayBuffer): { code: number; message: string } {
    const view = new DataView(data);
    const code = view.getUint8(1);
    const msgLen = view.getUint8(2);
    const msgBytes = new Uint8Array(data, 3, msgLen);
    const message = new TextDecoder().decode(msgBytes);
    return { code, message };
  }

  // Check if player is exploded from flags
  isExploded(flags: number): boolean {
    return (flags & PlayerFlags.Exploded) !== 0;
  }

  // Get color hex from index
  getColorHex(colorIndex: number): string {
    return ColorPalette[colorIndex % ColorPalette.length];
  }
}

export const protocol = new Protocol();
