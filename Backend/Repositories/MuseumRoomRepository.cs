using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using Backend.Models;

namespace Backend.Repositories
{
    public class MuseumRoomRepository : IMuseumRoomRepository
    {
        private static readonly ConcurrentDictionary<string, MuseumRoom> Rooms = new();
        private static readonly ConcurrentDictionary<string, string> ConnectionToRoom = new();
        private static readonly Regex HexColorRegex = new(@"^#[0-9a-fA-F]{6}$", RegexOptions.Compiled);

        public MuseumRoom GetOrCreateRoom(string roomCode)
        {
            roomCode = NormalizeRoomCode(roomCode);
            return Rooms.GetOrAdd(roomCode, code => new MuseumRoom { RoomCode = code });
        }

        public MuseumRoom? GetRoom(string roomCode)
        {
            roomCode = NormalizeRoomCode(roomCode);
            Rooms.TryGetValue(roomCode, out var room);
            return room;
        }

        public IEnumerable<MuseumRoom> GetAllRooms() => Rooms.Values;

        public MuseumPlayer? GetPlayerByConnection(string connectionId)
        {
            if (!ConnectionToRoom.TryGetValue(connectionId, out var roomCode))
                return null;
            if (!Rooms.TryGetValue(roomCode, out var room))
                return null;
            room.Players.TryGetValue(connectionId, out var player);
            return player;
        }

        public MuseumPlayer RegisterPlayer(string roomCode, string connectionId, string peerId, PlayerUpdateInput initial)
        {
            var room = GetOrCreateRoom(roomCode);
            var safeId = string.IsNullOrWhiteSpace(peerId)
                ? connectionId[..Math.Min(8, connectionId.Length)]
                : SanitizeString(peerId, 16);

            var player = new MuseumPlayer
            {
                Id = safeId,
                ConnectionId = connectionId,
                RoomCode = room.RoomCode,
                Name = SanitizeName(initial.Name),
                Color = SanitizeColor(initial.Color),
                X = Clamp(initial.X ?? 0, -40, 40),
                Y = Clamp(initial.Y ?? 0, 0, 9),
                Z = Clamp(initial.Z ?? 37, -36, 64),
                Yaw = ClampAngle(initial.Yaw ?? 0),
                Moving = initial.Moving ?? false,
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                IsDirty = false
            };

            room.Players[connectionId] = player;
            ConnectionToRoom[connectionId] = room.RoomCode;
            return player;
        }

        public MuseumPlayer? RemovePlayerByConnection(string connectionId)
        {
            if (!ConnectionToRoom.TryRemove(connectionId, out var roomCode))
                return null;

            if (!Rooms.TryGetValue(roomCode, out var room))
                return null;

            room.Players.TryRemove(connectionId, out var removed);
            if (room.Players.IsEmpty)
            {
                Rooms.TryRemove(roomCode, out _);
            }
            return removed;
        }

        public void RemoveRoomIfEmpty(string roomCode)
        {
            roomCode = NormalizeRoomCode(roomCode);
            if (Rooms.TryGetValue(roomCode, out var room) && room.Players.IsEmpty)
            {
                Rooms.TryRemove(roomCode, out _);
            }
        }

        public static string NormalizeRoomCode(string? code)
        {
            var clean = SanitizeString(code ?? "bao-tang-vnr", 40).ToLowerInvariant();
            return string.IsNullOrEmpty(clean) ? "bao-tang-vnr" : clean;
        }

        public static string SanitizeName(string? raw)
        {
            var s = SanitizeString(raw, 24);
            return string.IsNullOrEmpty(s) ? "Khách" : s;
        }

        public static string SanitizeColor(string? raw)
        {
            if (!string.IsNullOrEmpty(raw) && HexColorRegex.IsMatch(raw))
                return raw;
            return "#d62828";
        }

        public static string SanitizeString(string? raw, int maxLen)
        {
            if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
            var cleaned = Regex.Replace(raw, @"[\u0000-\u001f\u007f]", "");
            cleaned = Regex.Replace(cleaned, @"\s+", " ").Trim();
            return cleaned.Length > maxLen ? cleaned[..maxLen] : cleaned;
        }

        public static double Clamp(double val, double min, double max)
        {
            if (double.IsNaN(val) || double.IsInfinity(val)) return min;
            return Math.Max(min, Math.Min(max, Math.Round(val, 2)));
        }

        public static double ClampAngle(double val)
        {
            if (double.IsNaN(val) || double.IsInfinity(val)) return 0;
            return Math.Round(val, 3);
        }
    }
}

