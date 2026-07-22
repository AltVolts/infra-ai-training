external_url 'http://localhost:8080'
gitlab_rails['gitlab_shell_ssh_port'] = 2224

nginx['listen_https'] = false
nginx['listen_port'] = 8080

puma['port'] = 8180

registry_external_url 'http://localhost:8081'
registry_nginx['listen_port'] = 8081
registry_nginx['listen_https'] = false
