# ONE Fixora backend image (customer + mechanic + manager APIs + SignalR hub)
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY global.json Directory.Build.props Directory.Packages.props Fixora.sln ./
COPY src/ src/
COPY tests/ tests/
RUN dotnet restore src/Host/Fixora.Host/Fixora.Host.csproj
RUN dotnet publish src/Host/Fixora.Host/Fixora.Host.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "Fixora.Host.dll"]
