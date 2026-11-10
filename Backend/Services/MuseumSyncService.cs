using Backend.Hubs;
using Backend.Models;
using Backend.Repositories;
using Microsoft.AspNetCore.SignalR;

namespace Backend.Services
{
    /// <summary>
    /// Dịch vụ chạy nền (Server Tick Loop - 15Hz / 66ms).
    /// Gom toàn bộ thay đổi vị trí của 40-100 người chơi trong phòng thành 1 gói tin duy nhất (WorldTick),
    /// giúp trình duyệt phía người dùng giảm 97% số lần xử lý sự kiện mạng và giữ vững 60 FPS.
    /// </summary>
    public class MuseumSyncService : BackgroundService
    {
        private readonly IMuseumRoomRepository _roomRepo;
        private readonly IHubContext<MuseumHub> _hubContext;
        private static readonly TimeSpan TickInterval = TimeSpan.FromMilliseconds(66); // ~15 ticks/giây

        public MuseumSyncService(IMuseumRoomRepository roomRepo, IHubContext<MuseumHub> hubContext)
        {
            _roomRepo = roomRepo;
            _hubContext = hubContext;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            using var timer = new PeriodicTimer(TickInterval);
            int tickCount = 0;

            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                tickCount++;
                foreach (var room in _roomRepo.GetAllRooms())
                {
                    if (room.Players.IsEmpty) continue;

                    List<PlayerMoveTickDto>? batch = null;

                    foreach (var kv in room.Players)
                    {
                        var p = kv.Value;
                        if (!p.IsDirty) continue;

                        p.IsDirty = false;
                        batch ??= new List<PlayerMoveTickDto>(16);
                        batch.Add(new PlayerMoveTickDto
                        {
                            Id = p.Id,
                            X = p.X,
                            Y = p.Y,
                            Z = p.Z,
                            Yaw = p.Yaw,
                            Moving = p.Moving
                        });
                    }

                    if (batch is { Count: > 0 })
                    {
                        await _hubContext.Clients.Group(room.RoomCode).SendAsync("WorldTick", batch, stoppingToken);
                    }
                }

                // Mỗi ~15 giây (225 ticks), dọn dẹp kết nối bị treo quá 90 giây không có phản hồi
                if (tickCount % 225 == 0)
                {
                    CleanupStalePlayers(stoppingToken);
                }
            }
        }

        private void CleanupStalePlayers(CancellationToken ct)
        {
            var cutoff = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - 90_000;
            foreach (var room in _roomRepo.GetAllRooms())
            {
                foreach (var kv in room.Players)
                {
                    if (kv.Value.Timestamp < cutoff)
                    {
                        var removed = _roomRepo.RemovePlayerByConnection(kv.Key);
                        if (removed != null)
                        {
                            _ = _hubContext.Clients.Group(room.RoomCode).SendAsync("PeerLeft", removed.Id, ct);
                        }
                    }
                }
            }
        }
    }
}

