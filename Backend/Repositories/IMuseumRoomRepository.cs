using Backend.Models;

namespace Backend.Repositories
{
    public interface IMuseumRoomRepository
    {
        MuseumRoom GetOrCreateRoom(string roomCode);
        MuseumRoom? GetRoom(string roomCode);
        IEnumerable<MuseumRoom> GetAllRooms();
        MuseumPlayer? GetPlayerByConnection(string connectionId);
        MuseumPlayer RegisterPlayer(string roomCode, string connectionId, string peerId, PlayerUpdateInput initial);
        MuseumPlayer? RemovePlayerByConnection(string connectionId);
        void RemoveRoomIfEmpty(string roomCode);
    }
}

