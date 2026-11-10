using Backend.Hubs;
using Backend.Repositories;
using Backend.Services;

var builder = WebApplication.CreateBuilder(args);

// ── Repositories (DI) ──
builder.Services.AddSingleton<IMuseumRoomRepository, MuseumRoomRepository>();

// ── Background Services (15Hz Server Tick Batching) ──
builder.Services.AddHostedService<MuseumSyncService>();

// ── API Controllers & Swagger ──
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// ── CORS (Cho phép Frontend ở mọi cổng / domain kết nối SignalR) ──
builder.Services.AddCors(options =>
{
    options.AddPolicy("MuseumCorsPolicy", policy =>
    {
        policy.AllowAnyHeader()
              .AllowAnyMethod()
              .SetIsOriginAllowed(_ => true)
              .AllowCredentials();
    });
});

// ── SignalR (Tối ưu gói tin thời gian thực cho 40-100+ người) ──
builder.Services.AddSignalR(options =>
{
    options.MaximumReceiveMessageSize = 16 * 1024; // 16 KB
    options.KeepAliveInterval = TimeSpan.FromSeconds(10);
    options.ClientTimeoutInterval = TimeSpan.FromSeconds(30);
});

var app = builder.Build();

// ── Pipeline ──
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("MuseumCorsPolicy");

// Map REST API Controllers
app.MapControllers();

// Map SignalR Hub
app.MapHub<MuseumHub>("/museumHub");

app.MapGet("/", () => "Bảo tàng Lịch sử Đảng 3D - Realtime SignalR Backend Running! (15Hz Tick Batching)");

app.Run();

