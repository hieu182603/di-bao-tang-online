using Backend.Models;
using Backend.Repositories;
using Microsoft.AspNetCore.SignalR;

namespace Backend.Hubs
{
    /// <summary>
    /// SignalR Hub đồng bộ không gian Bảo tàng Lịch sử 3D.
    /// - Di chuyển (x, y, z, yaw, m) được ghi nhận Lock-Free vào RAM và gom gói (Batching) bởi MuseumSyncService (15Hz).
    /// - Chat, Emote, Vào/Rời phòng được phát tức thì để có độ phản hồi 0ms.
    /// </summary>
    public class MuseumHub : Hub
    {
        private readonly IMuseumRoomRepository _roomRepo;

        public MuseumHub(IMuseumRoomRepository roomRepo)
        {
            _roomRepo = roomRepo;
        }

        public async Task JoinRoom(string roomCode, string peerId, PlayerUpdateInput initial)
        {
            var player = _roomRepo.RegisterPlayer(roomCode, Context.ConnectionId, peerId, initial);
            var room = _roomRepo.GetOrCreateRoom(player.RoomCode);

            await Groups.AddToGroupAsync(Context.ConnectionId, room.RoomCode);

            // Gửi danh sách tất cả người đang ở trong bảo tàng cho người mới vào
            var peersSnapshot = room.Players.Values
                .Where(p => p.ConnectionId != Context.ConnectionId)
                .ToList();

            await Clients.Caller.SendAsync("RoomSnapshot", player.Id, peersSnapshot);

            // Thông báo cho những người khác trong phòng biết có người mới vào
            await Clients.OthersInGroup(room.RoomCode).SendAsync("PeerJoined", player);
        }

        public async Task UpdateState(PlayerUpdateInput patch)
        {
            var player = _roomRepo.GetPlayerByConnection(Context.ConnectionId);
            if (player == null) return;

            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            player.Timestamp = now;

            bool moved = false;
            if (patch.X.HasValue) { player.X = MuseumRoomRepository.Clamp(patch.X.Value, -66, 66); moved = true; }
            if (patch.Y.HasValue) { player.Y = MuseumRoomRepository.Clamp(patch.Y.Value, 0, 9); moved = true; }
            if (patch.Z.HasValue) { player.Z = MuseumRoomRepository.Clamp(patch.Z.Value, -36, 64); moved = true; }
            if (patch.Yaw.HasValue) { player.Yaw = MuseumRoomRepository.ClampAngle(patch.Yaw.Value); moved = true; }
            if (patch.Moving.HasValue) { player.Moving = patch.Moving.Value; moved = true; }

            if (moved)
            {
                // Đánh dấu để MuseumSyncService gom vào gói WorldTick tiếp theo (mỗi 66ms)
                player.IsDirty = true;
            }

            // Các sự kiện tức thì (Chat, Emote, Đổi tên/màu) được phát ngay lập tức
            bool immediateEvent = false;
            if (patch.Name != null)
            {
                player.Name = MuseumRoomRepository.SanitizeName(patch.Name);
                immediateEvent = true;
            }
            if (patch.Color != null)
            {
                player.Color = MuseumRoomRepository.SanitizeColor(patch.Color);
                immediateEvent = true;
            }
            if (patch.Say != null)
            {
                player.Say = MuseumRoomRepository.SanitizeString(patch.Say, 80);
                player.SayAt = patch.SayAt ?? now;
                immediateEvent = true;
            }
            if (patch.Emote != null)
            {
                player.Emote = MuseumRoomRepository.SanitizeString(patch.Emote, 12);
                player.EmoteAt = patch.EmoteAt ?? now;
                immediateEvent = true;
            }

            if (immediateEvent)
            {
                await Clients.OthersInGroup(player.RoomCode).SendAsync("PeerUpdated", player);
            }
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            var removed = _roomRepo.RemovePlayerByConnection(Context.ConnectionId);
            if (removed != null)
            {
                await Clients.Group(removed.RoomCode).SendAsync("PeerLeft", removed.Id);
            }
            await base.OnDisconnectedAsync(exception);
        }
    }
}

