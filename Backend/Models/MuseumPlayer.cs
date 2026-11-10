using System.Text.Json.Serialization;

namespace Backend.Models
{
    /// <summary>
    /// Đại diện cho một người tham quan trong không gian Bảo tàng 3D.
    /// Các thuộc tính JSON được rút gọn (x, y, z, yaw, n, c, m...) để tối ưu băng thông mạng
    /// khi đồng bộ 40-100 người chơi cùng lúc ở tần số cao (15Hz).
    /// </summary>
    public class MuseumPlayer
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonIgnore]
        public string ConnectionId { get; set; } = string.Empty;

        [JsonIgnore]
        public string RoomCode { get; set; } = string.Empty;

        [JsonPropertyName("n")]
        public string Name { get; set; } = "Khách";

        [JsonPropertyName("c")]
        public string Color { get; set; } = "#d62828";

        [JsonPropertyName("x")]
        public double X { get; set; } = 0;

        [JsonPropertyName("y")]
        public double Y { get; set; } = 0;

        [JsonPropertyName("z")]
        public double Z { get; set; } = 37;

        [JsonPropertyName("yaw")]
        public double Yaw { get; set; } = 0;

        [JsonPropertyName("m")]
        public bool Moving { get; set; } = false;

        [JsonPropertyName("say")]
        public string Say { get; set; } = string.Empty;

        [JsonPropertyName("sayAt")]
        public long SayAt { get; set; } = 0;

        [JsonPropertyName("emote")]
        public string Emote { get; set; } = string.Empty;

        [JsonPropertyName("emoteAt")]
        public long EmoteAt { get; set; } = 0;

        [JsonPropertyName("t")]
        public long Timestamp { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        /// <summary>
        /// Đánh dấu người chơi vừa có thay đổi vị trí cần được phát trong nhịp Tick tiếp theo.
        /// </summary>
        [JsonIgnore]
        public volatile bool IsDirty;
    }

    /// <summary>
    /// Gói tin cập nhật vị trí siêu nhẹ gửi trong mỗi nhịp Server Tick (15Hz).
    /// </summary>
    public class PlayerMoveTickDto
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("x")]
        public double X { get; set; }

        [JsonPropertyName("y")]
        public double Y { get; set; }

        [JsonPropertyName("z")]
        public double Z { get; set; }

        [JsonPropertyName("yaw")]
        public double Yaw { get; set; }

        [JsonPropertyName("m")]
        public bool Moving { get; set; }
    }

    /// <summary>
    /// Dữ liệu client gửi lên khi vào bảo tàng hoặc cập nhật trạng thái.
    /// </summary>
    public class PlayerUpdateInput
    {
        [JsonPropertyName("n")]
        public string? Name { get; set; }

        [JsonPropertyName("c")]
        public string? Color { get; set; }

        [JsonPropertyName("x")]
        public double? X { get; set; }

        [JsonPropertyName("y")]
        public double? Y { get; set; }

        [JsonPropertyName("z")]
        public double? Z { get; set; }

        [JsonPropertyName("yaw")]
        public double? Yaw { get; set; }

        [JsonPropertyName("m")]
        public bool? Moving { get; set; }

        [JsonPropertyName("say")]
        public string? Say { get; set; }

        [JsonPropertyName("sayAt")]
        public long? SayAt { get; set; }

        [JsonPropertyName("emote")]
        public string? Emote { get; set; }

        [JsonPropertyName("emoteAt")]
        public long? EmoteAt { get; set; }
    }
}

