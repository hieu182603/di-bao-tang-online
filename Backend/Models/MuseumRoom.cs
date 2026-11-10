using System.Collections.Concurrent;

namespace Backend.Models
{
    /// <summary>
    /// Phòng tham quan Bảo tàng trong bộ nhớ (In-memory).
    /// Sử dụng ConcurrentDictionary thay vì SemaphoreSlim để hàng chục người chơi
    /// có thể gửi tọa độ 3D liên tục mà không bị khóa luồng (Lock-free).
    /// </summary>
    public class MuseumRoom
    {
        public string RoomCode { get; set; } = "bao-tang-vnr";
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        /// <summary>
        /// Danh sách người tham quan theo ConnectionId -> MuseumPlayer.
        /// </summary>
        public ConcurrentDictionary<string, MuseumPlayer> Players { get; } = new();
    }
}

