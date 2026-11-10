using Backend.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class RoomsController : ControllerBase
    {
        private readonly IMuseumRoomRepository _roomRepo;

        public RoomsController(IMuseumRoomRepository roomRepo)
        {
            _roomRepo = roomRepo;
        }

        /// <summary>GET /api/rooms — Danh sách tất cả các phòng bảo tàng đang hoạt động.</summary>
        [HttpGet]
        public IActionResult GetAllRooms()
        {
            var rooms = _roomRepo.GetAllRooms().Select(r => new
            {
                r.RoomCode,
                r.CreatedAt,
                PlayerCount = r.Players.Count
            });
            return Ok(rooms);
        }

        /// <summary>GET /api/rooms/{code} — Chi tiết người tham quan trong phòng.</summary>
        [HttpGet("{code}")]
        public IActionResult GetRoom(string code)
        {
            var room = _roomRepo.GetRoom(code);
            if (room == null)
            {
                return Ok(new
                {
                    RoomCode = MuseumRoomRepository.NormalizeRoomCode(code),
                    PlayerCount = 0,
                    Players = Array.Empty<object>()
                });
            }

            return Ok(new
            {
                room.RoomCode,
                room.CreatedAt,
                PlayerCount = room.Players.Count,
                Players = room.Players.Values
            });
        }
    }
}

